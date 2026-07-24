plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.paitv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.paitv"
        minSdk = 25
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildFeatures {
        viewBinding = true
        buildConfig = true
    }

    flavorDimensions += "env"
    productFlavors {
        create("prod") {
            dimension = "env"
            buildConfigField("String", "SERVER_URL", "\"https://paitv.com.br\"")
        }
        create("homolog") {
            dimension = "env"
            applicationIdSuffix = ".homolog"
            versionNameSuffix = "-homolog"
            buildConfigField("String", "SERVER_URL", "\"https://homolog.paitv.com.br\"")
            resValue("string", "app_name", "PAI TV HML")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")

    // ExoPlayer / Media3 — 1.4.0+ necessário: PlayerView só ganhou suporte
    // de exibição de imagem (ImageOutput) nessa versão; no 1.3.x o ImageRenderer
    // decodifica a imagem (timing correto) mas a PlayerView nunca desenha o bitmap.
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")

    // HTTP
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // JSON
    implementation("com.google.code.gson:gson:2.10.1")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")
}
