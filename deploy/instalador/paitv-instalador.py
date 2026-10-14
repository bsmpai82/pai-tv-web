#!/usr/bin/env python3
"""PAI TV — Instalador.

Janela simples para a maquina Linux instaladora: digita o IP do stick, conecta via ADB
e escolhe uma acao:
  - Reiniciar        -> adb reboot
  - Atualizar app    -> baixa o APK mais recente do painel e faz install -r (mantem dados e kiosk)
  - Instalar do zero -> instala + aplica a receita de kiosk (Intelbras/Google TV ou Fire TV)

O APK vem sempre de https://paitv.com.br/apk/<token> (mesmo arquivo enviado em /settings).
O download usa GET condicional (ETag/Last-Modified): so baixa de novo quando o APK mudou.

Preparacao da maquina: deploy/instalador/instalar.sh
Receita de kiosk: mesma de deploy/kiosk-intelbras.sh (validada em 2026-07-03).
"""

import json
import os
import queue
import re
import shutil
import subprocess
import threading
import time
import tkinter as tk
import tkinter.font as tkfont
import urllib.error
import urllib.request
from pathlib import Path
from tkinter import messagebox, scrolledtext, simpledialog

PACOTE = "com.paitv"
COMPONENTE = "com.paitv/com.paitv.MainActivity"
LAUNCHER_GOOGLE = "com.google.android.tvlauncher"
LAUNCHER_AMAZON = "com.amazon.tv.launcher"
PORTA = 5555

CONFIG_DIR = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "paitv-instalador"
CACHE_DIR = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "paitv-instalador"
CONFIG_FILE = CONFIG_DIR / "config.json"
APK_CACHE = CACHE_DIR / "pai-tv.apk"
APK_META = CACHE_DIR / "pai-tv.json"

TAMANHO_MINIMO_APK = 1024 * 1024  # abaixo disso o download certamente e uma pagina de erro

MSG_UNAUTHORIZED = (
    "O stick nao autorizou esta maquina.\n"
    "Olhe a TV: deve aparecer 'Permitir depuracao USB?'. Marque 'Sempre permitir "
    "a partir deste computador', confirme no controle e clique Conectar de novo."
)
MSG_SEM_CONEXAO = (
    "Nao foi possivel conectar no stick. Confira:\n"
    "- o IP (Configuracoes -> Rede e Internet -> sua Wi-Fi);\n"
    "- se o stick esta ligado e acordado;\n"
    "- se esta maquina esta na mesma rede Wi-Fi do stick;\n"
    "- se 'Depuracao ADB' e 'Depuracao por rede' estao ligadas nas Opcoes do desenvolvedor."
)


class ErroAcao(Exception):
    """Erro com mensagem pronta para o operador."""


class SemInternet(Exception):
    """Servidor do APK inacessivel."""


# ---------------------------------------------------------------- configuracao

def ler_json(caminho):
    try:
        return json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def gravar_json(caminho, dados):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    tmp = caminho.with_suffix(".tmp")
    tmp.write_text(json.dumps(dados, indent=2), encoding="utf-8")
    os.replace(tmp, caminho)


def ler_config():
    return ler_json(CONFIG_FILE)


def salvar_config(**campos):
    config = ler_config()
    config.update(campos)
    gravar_json(CONFIG_FILE, config)


def normalizar_link(link):
    link = (link or "").strip()
    if link and not link.startswith(("http://", "https://")):
        link = "https://" + link
    return link


# ---------------------------------------------------------------- adb

def achar_adb():
    adb = shutil.which("adb")
    if adb:
        return adb
    # fallback do runbook: platform-tools oficial descompactado na home
    alternativo = Path.home() / "platform-tools" / "adb"
    return str(alternativo) if alternativo.exists() else None


ADB = achar_adb()


def adb(serial, *args, timeout=60):
    """Roda um comando adb e devolve (codigo, saida stdout+stderr)."""
    cmd = [ADB] + (["-s", serial] if serial else []) + list(args)
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise ErroAcao("O stick demorou demais para responder (%s). Tente de novo." % " ".join(args[:2]))
    saida = ((r.stdout or "") + (r.stderr or "")).strip()
    return r.returncode, saida


def shell(serial, comando, timeout=60):
    return adb(serial, "shell", comando, timeout=timeout)


def detectar(serial):
    """Descobre modelo, tipo de launcher e versao do PAI TV instalada."""
    _, fabricante = shell(serial, "getprop ro.product.manufacturer")
    _, modelo = shell(serial, "getprop ro.product.model")
    _, pacotes = shell(serial, "pm list packages")
    linhas = set(pacotes.split())

    if "package:" + LAUNCHER_AMAZON in linhas:
        tipo = "firetv"
    elif "package:" + LAUNCHER_GOOGLE in linhas:
        tipo = "googletv"
    else:
        tipo = None

    instalado = "package:" + PACOTE in linhas
    versao = None
    if instalado:
        _, dump = shell(serial, "dumpsys package " + PACOTE)
        m = re.search(r"versionName=(\S+)", dump)
        versao = m.group(1) if m else "?"

    return {
        "aparelho": ("%s %s" % (fabricante, modelo)).strip() or "modelo desconhecido",
        "tipo": tipo,
        "instalado": instalado,
        "versao": versao,
    }


# ---------------------------------------------------------------- download do APK

def baixar_apk(url, log):
    """Baixa o APK se mudou no servidor. Devolve o caminho do APK em cache."""
    cabecalhos = {"User-Agent": "paitv-instalador"}
    meta = ler_json(APK_META) if APK_CACHE.exists() else {}
    if meta.get("etag"):
        cabecalhos["If-None-Match"] = meta["etag"]
    if meta.get("last_modified"):
        cabecalhos["If-Modified-Since"] = meta["last_modified"]

    log("Verificando a versao do APK no servidor...")
    try:
        resp = urllib.request.urlopen(urllib.request.Request(url, headers=cabecalhos), timeout=30)
    except urllib.error.HTTPError as e:
        if e.code == 304:
            log("O APK do servidor nao mudou desde o ultimo download — usando o que ja esta baixado.")
            return APK_CACHE
        if e.code == 404:
            raise ErroAcao(
                "Link do APK invalido ou APK nao enviado (erro 404).\n"
                "Peca o link atual em paitv.com.br/settings (card 'Distribuicao do APK') "
                "e use o botao 'Configurar link do APK'."
            )
        raise ErroAcao("O servidor respondeu com erro %d ao baixar o APK." % e.code)
    except (urllib.error.URLError, OSError) as e:
        raise SemInternet(str(e))

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = APK_CACHE.with_suffix(".part")
    total = int(resp.headers.get("Content-Length") or 0)
    baixado = 0
    proximo = 10
    try:
        with resp, open(tmp, "wb") as f:
            while True:
                bloco = resp.read(256 * 1024)
                if not bloco:
                    break
                f.write(bloco)
                baixado += len(bloco)
                if total and baixado * 100 // total >= proximo:
                    log("  baixando... %d%%" % (baixado * 100 // total))
                    while proximo <= baixado * 100 // total:
                        proximo += 10
    except OSError as e:
        tmp.unlink(missing_ok=True)
        raise SemInternet(str(e))

    with open(tmp, "rb") as f:
        inicio = f.read(300)
    if baixado < TAMANHO_MINIMO_APK or not inicio.startswith(b"PK"):
        tmp.unlink(missing_ok=True)
        trecho = inicio.decode("utf-8", "replace").strip()[:150]
        raise ErroAcao("O arquivo baixado nao e um APK valido. Resposta do servidor: %s" % trecho)

    os.replace(tmp, APK_CACHE)
    gravar_json(APK_META, {
        "etag": resp.headers.get("ETag"),
        "last_modified": resp.headers.get("Last-Modified"),
        "baixado_em": time.strftime("%d/%m/%Y %H:%M"),
    })
    log("APK novo baixado (%.1f MB)." % (baixado / 1048576))
    return APK_CACHE


# ---------------------------------------------------------------- janela

class App:
    def __init__(self, root):
        self.root = root
        self.fila = queue.Queue()
        self.ocupado = False
        self.serial = None
        self.info = {}

        root.title("PAI TV — Instalador")
        root.geometry("720x540")
        root.minsize(560, 420)
        for nome in ("TkDefaultFont", "TkTextFont", "TkFixedFont"):
            tkfont.nametofont(nome).configure(size=12)

        topo = tk.Frame(root, padx=12, pady=10)
        topo.pack(fill="x")
        tk.Label(topo, text="IP do stick:").pack(side="left")
        self.ip = tk.Entry(topo, width=18, font=(tkfont.nametofont("TkFixedFont").actual("family"), 14))
        self.ip.pack(side="left", padx=8)
        self.ip.insert(0, ler_config().get("ultimo_ip", ""))
        self.ip.bind("<Return>", lambda _e: self.clicar_conectar())
        self.bt_conectar = tk.Button(topo, text="Conectar", width=10, command=self.clicar_conectar)
        self.bt_conectar.pack(side="left")

        self.status = tk.Label(root, text="● Desconectado", fg="gray40", anchor="w", padx=12)
        self.status.pack(fill="x")

        acoes = tk.Frame(root, padx=12, pady=10)
        acoes.pack(fill="x")
        self.bt_reiniciar = tk.Button(acoes, text="Reiniciar", width=14, command=self.clicar_reiniciar)
        self.bt_atualizar = tk.Button(acoes, text="Atualizar app", width=14, command=self.clicar_atualizar)
        self.bt_instalar = tk.Button(acoes, text="Instalar do zero", width=14, command=self.clicar_instalar)
        for bt in (self.bt_reiniciar, self.bt_atualizar, self.bt_instalar):
            bt.pack(side="left", padx=(0, 8))

        self.texto = scrolledtext.ScrolledText(root, height=14, state="disabled", wrap="word", padx=8, pady=6)
        self.texto.pack(fill="both", expand=True, padx=12)
        self.texto.tag_configure("erro", foreground="#c62828")
        self.texto.tag_configure("ok", foreground="#2e7d32")
        self.texto.tag_configure("titulo", font=(tkfont.nametofont("TkDefaultFont").actual("family"), 12, "bold"))
        self.texto.tag_configure("cmd", foreground="gray45")

        rodape = tk.Frame(root, padx=12, pady=8)
        rodape.pack(fill="x")
        tk.Button(rodape, text="Configurar link do APK", command=self.clicar_configurar_link).pack(side="left")
        tk.Button(rodape, text="Limpar log", command=self.limpar_log).pack(side="right")

        self.atualizar_botoes()
        self.root.after(100, self.processar_fila)

        if not ADB:
            self.log("adb nao encontrado. Rode deploy/instalador/instalar.sh (instala o adb).", "erro")
            self.bt_conectar.configure(state="disabled")
        else:
            self.log("Digite o IP do stick e clique Conectar.")
            if not ler_config().get("apk_url"):
                self.log("Link do APK ainda nao configurado — clique em 'Configurar link do APK'.", "erro")
        self.ip.focus_set()

    # ---------- infraestrutura de thread: tkinter so pode ser mexido na thread principal

    def processar_fila(self):
        try:
            while True:
                self.fila.get_nowait()()
        except queue.Empty:
            pass
        self.root.after(100, self.processar_fila)

    def na_principal(self, fn):
        """Roda fn na thread principal e espera o resultado (usado pelos workers)."""
        resultado = {}
        pronto = threading.Event()

        def rodar():
            try:
                resultado["valor"] = fn()
            finally:
                pronto.set()

        self.fila.put(rodar)
        pronto.wait()
        return resultado.get("valor")

    def log(self, msg, tag=None):
        def escrever():
            self.texto.configure(state="normal")
            self.texto.insert("end", msg + "\n", tag)
            self.texto.see("end")
            self.texto.configure(state="disabled")
        self.fila.put(escrever)

    def limpar_log(self):
        self.texto.configure(state="normal")
        self.texto.delete("1.0", "end")
        self.texto.configure(state="disabled")

    def executar(self, fn):
        if self.ocupado:
            return
        self.ocupado = True
        self.atualizar_botoes()

        def worker():
            try:
                fn()
            except ErroAcao as e:
                self.log("ERRO: %s" % e, "erro")
            except Exception as e:  # noqa: BLE001 — qualquer falha inesperada vai pro log, nao derruba a janela
                self.log("ERRO inesperado: %r" % e, "erro")
            finally:
                self.fila.put(self.terminar)

        threading.Thread(target=worker, daemon=True).start()

    def terminar(self):
        self.ocupado = False
        self.atualizar_botoes()

    def atualizar_botoes(self):
        def estado(ativo):
            return "normal" if ativo and not self.ocupado else "disabled"
        conectado = self.serial is not None
        self.bt_conectar.configure(state=estado(ADB is not None))
        self.bt_reiniciar.configure(state=estado(conectado))
        self.bt_atualizar.configure(state=estado(conectado and self.info.get("instalado")))
        self.bt_instalar.configure(state=estado(conectado and self.info.get("tipo") is not None))

    def definir_conexao(self, serial, info):
        def aplicar():
            self.serial = serial
            self.info = info or {}
            if not serial:
                self.status.configure(text="● Desconectado", fg="gray40")
            else:
                tipo = {"firetv": "Fire TV", "googletv": "Android/Google TV"}.get(info["tipo"], "launcher desconhecido")
                app = "PAI TV %s" % info["versao"] if info["instalado"] else "PAI TV nao instalado"
                self.status.configure(text="● Conectado — %s (%s) · %s" % (info["aparelho"], tipo, app), fg="#2e7d32")
            self.atualizar_botoes()
        self.fila.put(aplicar)

    # ---------- passos reutilizados

    def ler_ip(self):
        ip = self.ip.get().strip()
        ip = re.sub(r":%d$" % PORTA, "", ip)
        if not re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", ip):
            messagebox.showwarning("IP invalido", "Digite o IP do stick, por exemplo 192.168.0.25.", parent=self.root)
            return None
        return ip

    def conectar(self, ip):
        serial = "%s:%d" % (ip, PORTA)
        self.log("Conectando em %s..." % serial, "titulo")
        _, saida = adb(None, "connect", serial, timeout=20)
        self.log(saida, "cmd")
        if "authenticate" in saida:
            adb(None, "disconnect", serial, timeout=10)
            raise ErroAcao(MSG_UNAUTHORIZED)
        if not saida.startswith(("connected", "already connected")):
            raise ErroAcao(MSG_SEM_CONEXAO)

        # depois do connect o stick pode levar um instante para sair de "offline"
        for _ in range(5):
            _, estado = adb(serial, "get-state", timeout=10)
            if estado == "device":
                break
            if "unauthorized" in estado:
                adb(None, "disconnect", serial, timeout=10)
                raise ErroAcao(MSG_UNAUTHORIZED)
            time.sleep(1)
        else:
            raise ErroAcao("O stick conectou mas nao respondeu (%s). %s" % (estado, MSG_SEM_CONEXAO))

        info = detectar(serial)
        salvar_config(ultimo_ip=ip)
        self.definir_conexao(serial, info)
        app = "versao %s instalada" % info["versao"] if info["instalado"] else "PAI TV nao instalado"
        self.log("Conectado: %s — %s." % (info["aparelho"], app), "ok")
        if info["tipo"] is None:
            self.log("Launcher nao reconhecido (nem Google TV nem Fire TV): 'Instalar do zero' fica desativado.", "erro")
        return serial, info

    def garantir_conexao(self):
        """Confere se o stick ainda responde; tenta reconectar uma vez."""
        _, estado = adb(self.serial, "get-state", timeout=10)
        if estado == "device":
            return
        self.log("Conexao perdida, reconectando...")
        try:
            self.conectar(self.serial.split(":")[0])
        except ErroAcao:
            self.definir_conexao(None, None)
            raise

    def obter_apk(self):
        url = ler_config().get("apk_url")
        if not url:
            url = self.na_principal(self.pedir_link)
            if not url:
                raise ErroAcao("Sem o link do APK nao da para baixar. Use 'Configurar link do APK'.")
        try:
            return baixar_apk(url, self.log)
        except SemInternet as e:
            self.log("Sem acesso ao servidor (%s)." % e, "erro")
            if not APK_CACHE.exists():
                raise ErroAcao("Sem internet e nenhum APK baixado antes. Verifique a conexao desta maquina.")
            quando = ler_json(APK_META).get("baixado_em", "data desconhecida")
            usar = self.na_principal(lambda: messagebox.askyesno(
                "Sem acesso ao servidor",
                "Nao foi possivel baixar o APK mais novo.\n\n"
                "Usar o APK baixado anteriormente (%s)? Ele pode estar desatualizado." % quando,
                parent=self.root))
            if not usar:
                raise ErroAcao("Cancelado.")
            return APK_CACHE

    def instalar_apk(self, apk):
        self.log("Instalando no stick (pode levar 1-2 minutos)...")
        _, saida = adb(self.serial, "install", "-r", str(apk), timeout=600)
        self.log(saida.splitlines()[-1] if saida else "(sem resposta)", "cmd")
        if "Success" in saida:
            return
        if "INSTALL_FAILED_UPDATE_INCOMPATIBLE" in saida:
            raise ErroAcao(
                "A assinatura do APK novo e diferente da que esta no stick, entao nao da para atualizar por cima. "
                "Sera preciso desinstalar e reprovisionar o stick (ver SETUP-DESKTOP-INSTALADOR.md) — chame o responsavel tecnico."
            )
        if "INSTALL_FAILED_VERSION_DOWNGRADE" in saida:
            raise ErroAcao("O APK do painel e mais antigo que o instalado no stick. Nada foi alterado.")
        if "INSTALL_FAILED_INSUFFICIENT_STORAGE" in saida:
            raise ErroAcao("O stick esta sem espaco livre para instalar.")
        raise ErroAcao("Falha na instalacao: %s" % (saida.splitlines()[-1] if saida else "sem resposta"))

    def abrir_app(self):
        shell(self.serial, "am start -n " + COMPONENTE)

    def reiniciar(self):
        try:
            adb(self.serial, "reboot", timeout=20)
        except ErroAcao:
            pass  # a conexao cai durante o reboot; nao e erro
        self.definir_conexao(None, None)

    # ---------- botoes

    def clicar_conectar(self):
        ip = self.ler_ip()
        if ip:
            self.definir_conexao(None, None)
            self.executar(lambda: self.conectar(ip))

    def clicar_reiniciar(self):
        if not messagebox.askyesno("Reiniciar", "Reiniciar o stick %s?" % self.serial, parent=self.root):
            return

        def acao():
            self.garantir_conexao()
            self.log("Reiniciando %s..." % self.serial, "titulo")
            self.reiniciar()
            self.log("Stick reiniciando. O PAI TV abre sozinho em ~30-60 segundos.", "ok")
        self.executar(acao)

    def clicar_atualizar(self):
        def acao():
            self.garantir_conexao()
            self.log("Atualizando o PAI TV em %s" % self.serial, "titulo")
            antes = self.info.get("versao")
            apk = self.obter_apk()
            self.instalar_apk(apk)
            self.abrir_app()
            info = detectar(self.serial)
            self.definir_conexao(self.serial, info)
            if info["versao"] == antes:
                self.log("Pronto. O stick ja estava na versao %s (APK reinstalado)." % antes, "ok")
            else:
                self.log("Pronto. Atualizado: %s -> %s." % (antes, info["versao"]), "ok")
        self.executar(acao)

    def clicar_instalar(self):
        info = self.info
        if info.get("instalado"):
            pergunta = ("O PAI TV ja esta instalado nesse stick.\n"
                        "Para so trocar de versao, use 'Atualizar app'.\n\n"
                        "Reaplicar instalacao + modo kiosk mesmo assim? O stick vai reiniciar no final.")
        else:
            pergunta = ("Instalar o PAI TV e ativar o modo kiosk em %s?\n"
                        "O stick vai reiniciar no final." % info.get("aparelho"))
        if not messagebox.askyesno("Instalar do zero", pergunta, parent=self.root):
            return

        def acao():
            self.garantir_conexao()
            tipo = self.info["tipo"]
            google = tipo == "googletv"
            total = 5 if google else 4
            self.log("Instalacao completa em %s (%s)" % (self.serial, "Android/Google TV" if google else "Fire TV"), "titulo")

            self.log("[1/%d] Baixando o APK" % total, "titulo")
            apk = self.obter_apk()

            self.log("[2/%d] Instalando" % total, "titulo")
            self.instalar_apk(apk)
            self.abrir_app()

            self.log("[3/%d] Definindo o PAI TV como tela inicial (HOME)" % total, "titulo")
            _, saida = shell(self.serial, "cmd package set-home-activity " + COMPONENTE)
            self.log(saida, "cmd")
            if "Success" not in saida:
                raise ErroAcao("Nao foi possivel definir o PAI TV como HOME: %s" % saida)

            if google:
                # o firmware reseta o HOME a cada boot; com o launcher suspenso o reset nao acontece
                self.log("[4/%d] Suspendendo o launcher Google" % total, "titulo")
                _, saida = shell(self.serial, "pm suspend " + LAUNCHER_GOOGLE)
                self.log(saida, "cmd")
                if "true" not in saida:
                    raise ErroAcao("Nao foi possivel suspender o launcher Google: %s" % saida)

            self.log("[%d/%d] Reiniciando para validar o boot" % (total, total), "titulo")
            self.reiniciar()
            self.log("Pronto. Confira:\n"
                     "- apos o boot (~30-60 s) o PAI TV abre sozinho;\n"
                     "- botao HOME do controle -> o app volta sozinho em ate 1 minuto;\n"
                     "- o stick aparece online em paitv.com.br/devices.", "ok")
        self.executar(acao)

    def pedir_link(self):
        atual = ler_config().get("apk_url", "")
        link = simpledialog.askstring(
            "Link do APK",
            "Cole o link de download do APK\n(paitv.com.br/settings -> card 'Distribuicao do APK'):",
            initialvalue=atual, parent=self.root)
        link = normalizar_link(link)
        if not link:
            return None
        if "/apk/" not in link:
            messagebox.showwarning("Link invalido", "O link deve ser no formato https://paitv.com.br/apk/<token>.", parent=self.root)
            return None
        salvar_config(apk_url=link)
        self.log("Link do APK salvo.", "ok")
        return link

    def clicar_configurar_link(self):
        self.pedir_link()


def main():
    root = tk.Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
