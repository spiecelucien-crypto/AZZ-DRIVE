# Travailler depuis Windows

Une app iPhone se compile uniquement avec Xcode sur macOS. Depuis Windows, vous pouvez quand même :

## 1. Modifier le code
Ouvrez le dossier dans VS Code (extension « Swift » recommandée). Poussez vos changements sur une branche.

## 2. Tester le moteur de navigation
Installez Swift pour Windows (https://www.swift.org/install/windows/), puis dans le dossier du projet :

```powershell
swift test
```

Ce test couvre la géométrie, le guidage, les annonces vocales, la simulation, la caméra et le partage (17 tests).

## 3. Compiler l'app iOS complète
Chaque push sur `main` et chaque pull request lancent le workflow **iOS build & tests** sur un Mac GitHub :
- compilation de l'app pour simulateur iPhone ;
- exécution de tous les tests ;
- journal de compilation téléchargeable dans l'onglet **Actions** (artefact `build-log`).

Vous pouvez aussi le lancer à la main : onglet **Actions** > **iOS build & tests** > **Run workflow**.

## 4. Installer sur un iPhone
Il faut un Mac (ou un Mac loué en ligne) avec Xcode et un compte Apple, au minimum gratuit, pour signer l'app.

## 5. Tester la page de suivi des proches
Ouvrez https://spiecelucien-crypto.github.io/AZZ-DRIVE/suivi.html : sans lien de trajet, elle affiche « Lien de suivi incomplet », c'est normal.
