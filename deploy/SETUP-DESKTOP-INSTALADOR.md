# Preparar um desktop Linux como estação de instalação de sticks

Runbook para deixar uma máquina Ubuntu/Debian nova pronta para **instalar o APK e configurar
o modo kiosk** em sticks novos (Intelbras IZY Play e Fire TV Stick).

Tempo estimado: ~10 minutos de preparação da máquina + ~3 minutos por stick.

---

## O que essa máquina é (e o que não é)

| Faz | Não faz |
|---|---|
| Instala o APK nos sticks via ADB na LAN | **Não compila** o APK (isso fica no desktop Windows) |
| Aplica a receita de kiosk/autostart | Não roda o servidor Node.js |
| Diagnostica stick que não sobe sozinho | Não precisa de Android Studio, JDK, SDK nem Gradle |

**Pré-requisitos:**

- Ubuntu ou Debian (comandos `apt`).
- A máquina precisa estar na **mesma rede Wi-Fi/LAN dos sticks** — o ADB fala na porta TCP 5555.
  Rede de convidados com *AP isolation*, ou stick em VLAN separada, impede a conexão.
- Acesso ao painel `https://paitv.com.br/settings` para pegar o link de download do APK.

---

## 1. Instalar os pacotes

```bash
sudo apt update
sudo apt install -y adb git curl
adb version
```

**Não instalar** JDK, Android SDK, Android Studio nem Gradle. Essa máquina só consome
o APK pronto.

### Fallback: se o `adb` do apt for antigo ou não existir

Use o platform-tools oficial do Google:

```bash
cd ~
curl -LO https://dl.google.com/android/repository/platform-tools-latest-linux.zip
unzip platform-tools-latest-linux.zip
echo 'export PATH=$PATH:$HOME/platform-tools' >> ~/.bashrc
source ~/.bashrc
adb version
```

---

## 2. Clonar o repositório (só pelos scripts)

```bash
git clone https://github.com/bsmpai82/pai-tv-web.git ~/pai-tv-web
chmod +x ~/pai-tv-web/deploy/kiosk-intelbras.sh
```

**Não** rodar `npm install` — nada da pasta `server/` é usado aqui. O clone serve apenas
para ter o `deploy/kiosk-intelbras.sh`.

---

## 3. Baixar o APK (sem compilar)

O APK de produção fica hospedado no próprio painel. Pegue o link em
`https://paitv.com.br/settings` → card **"Distribuição do APK"**.

```bash
mkdir -p ~/pai-tv-apk
curl -L -o ~/pai-tv-apk/pai-tv-prod.apk "https://paitv.com.br/apk/<token>"
ls -lh ~/pai-tv-apk/
```

Confira o tamanho: tem que dar **dezenas de MB**. Se vier um arquivo minúsculo, o
download falhou (token errado, APK não enviado) — abra o arquivo com `cat` para ver a
mensagem de erro do servidor.

**Pontos de atenção:**

- O painel hospeda **um único APK** — sempre o último enviado por upload, gravado como
  `pai-tv.apk`. Se estiver desatualizado, quem compila (desktop Windows) precisa subir a
  versão nova em `/settings` **antes** de você baixar.
- O APK do painel é o de **produção** (`com.paitv`). Para o flavor homolog
  (`com.paitv.homolog`) não existe download — teria que vir por pendrive/scp da máquina
  que compila. Na prática não é o caso: não há mais stick físico de homolog.
- Sem o SDK não há `aapt` para inspecionar o APK antes de instalar. A conferência do
  flavor é feita **depois** da instalação (ver seção 6).
- Se o token for rotacionado no painel, o link antigo para de funcionar na hora — basta
  pegar o novo em `/settings`.

---

## 4. Preparar o stick (uma vez, pelo controle da TV)

- **Configurações → Preferências do dispositivo → Sobre** → clicar 7× em "Compilação"
  (habilita as opções de desenvolvedor).
- **Configurações → Preferências do dispositivo → Opções do desenvolvedor** →
  **Depuração ADB: ON** e **Depuração por rede: ON**.
- Anotar o IP: **Configurações → Rede e Internet → [sua Wi-Fi]**.

---

## 5. Provisionar o stick

### Intelbras IZY Play

```bash
IP="192.168.x.x"                       # trocar pelo IP do stick
APK=~/pai-tv-apk/pai-tv-prod.apk

adb connect ${IP}:5555
adb uninstall com.paitv                # ok falhar se ainda não estiver instalado
adb install "$APK"
adb shell am start -n com.paitv/.MainActivity
~/pai-tv-web/deploy/kiosk-intelbras.sh -i $IP -f prod -a
```

O script já faz o diagnóstico, aplica `set-home-activity`, suspende o launcher Google
(`pm suspend com.google.android.tvlauncher`) e reinicia o stick.

- Rodar **sem** o `-a` faz só o diagnóstico, sem alterar nada.
- Rodar com `-r` reverte: devolve o launcher Google como HOME.
- `-f homolog` usa o pacote `com.paitv.homolog` em vez do de produção.

**Por que o `pm suspend`:** o firmware Android 14 do Intelbras reseta o HOME preferido de
volta pro launcher Google a cada boot. `pm disable-user` e `pm uninstall --user 0` são
bloqueados pelo OEM. `pm suspend` passa e sobrevive ao reboot.

### Fire TV Stick

```bash
IP="192.168.x.x"
APK=~/pai-tv-apk/pai-tv-prod.apk

adb connect ${IP}:5555
adb uninstall com.paitv
adb install "$APK"
adb shell cmd package set-home-activity com.paitv/.MainActivity
adb reboot
```

No Fire TV o `set-home-activity` sozinho basta — o launcher da Amazon é protegido e
`pm disable-user` retorna `SecurityException`, então nem tente.

> **Fire TV modelos 2026 com Vega OS não rodam APK Android.** Confira em
> Configurações → Sobre: se disser "OS 1.x", o stick é incompatível com o PAI TV.

---

## 6. Verificar (por stick)

1. **Flavor certo:**
   ```bash
   adb shell pm list packages | grep paitv
   ```
   Tem que sair `package:com.paitv`. Se sair `com.paitv.homolog`, você instalou o APK errado.

2. **Boot:** após o reboot, o PAI TV abre sozinho em ~30-60s.

3. **Watchdog:** apertar HOME no controle → o `SyncService` relança a MainActivity em até
   1 minuto. No Intelbras aparece por alguns segundos o diálogo "app suspenso" do sistema
   antes disso — comportamento esperado.

4. **Cold boot:** tirar da tomada e religar → o app volta sozinho.

5. **Painel:** `https://paitv.com.br/devices` → o dispositivo aparece **online**.

---

## Troubleshooting

### `device unauthorized`

**A causa nº 1 numa máquina nova.** A chave RSA do ADB é nova, então o stick mostra na TV
um prompt "Permitir depuração USB?" que precisa ser aceito no controle — marque
"Sempre permitir a partir deste computador". Depois:

```bash
adb kill-server
adb connect ${IP}:5555
adb devices          # tem que aparecer "device", não "unauthorized"
```

### `failed to connect` / `offline`

- Stick dormindo — acorde pelo controle.
- IP mudou (DHCP) — confira nas configurações de rede da TV.
- Máquina e stick em redes diferentes, ou AP isolation ativo no roteador.
- "Depuração por rede" desligou depois de um reboot — reative.

### `INSTALL_FAILED_UPDATE_INCOMPATIBLE`

Assinatura diferente da versão já instalada. Desinstale antes:

```bash
adb uninstall com.paitv && adb install "$APK"
```

### `DELETE_FAILED_INTERNAL_ERROR` ao desinstalar

O pacote é o HOME ativo do sistema. Devolva o launcher original primeiro e só então
desinstale:

```bash
~/pai-tv-web/deploy/kiosk-intelbras.sh -i $IP -r     # reverte e reinicia
# esperar o boot
adb connect ${IP}:5555 && adb uninstall com.paitv
```

### Vários dispositivos conectados ao mesmo tempo

Direcione cada comando com `-s`:

```bash
adb devices
adb -s 192.168.x.x:5555 install "$APK"
```

### Conexão por cabo USB (raro — aqui tudo é por rede)

Adicione o usuário ao grupo `plugdev` e reinicie a sessão:

```bash
sudo usermod -aG plugdev $USER
```

---

## Manter a máquina atualizada

Quando sair uma versão nova do app:

```bash
cd ~/pai-tv-web && git pull                                    # scripts de kiosk
curl -L -o ~/pai-tv-apk/pai-tv-prod.apk "https://paitv.com.br/apk/<token>"   # APK novo
```
