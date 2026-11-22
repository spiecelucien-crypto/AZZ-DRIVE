# Essai depuis Windows

Ce contrôle vérifie que l'archive est complète et que les fichiers essentiels sont présents. Il ne remplace pas une compilation Xcode.

## 1. Extraire le projet

- Télécharger `AZZ-DRIVE-Phase5-Foundation.zip`.
- Dans l'Explorateur Windows : clic droit > **Extraire tout…**.
- Ouvrir le dossier `AZZ-DRIVE` extrait.

## 2. Lancer le contrôle local

- Ouvrir le dossier `scripts`.
- Clic droit sur `Verify-AZZ-DRIVE.ps1` > **Exécuter avec PowerShell**.
- Si Windows bloque le script, ouvrir PowerShell dans le dossier et lancer :

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\Verify-AZZ-DRIVE.ps1
```

Le résultat attendu est `OK` pour les fichiers essentiels et le manifeste XML. Ce contrôle ne peut pas valider les API Apple ni construire l'application.

## 3. Lancer la compilation iOS distante

Le dépôt doit être sur GitHub pour que le workflow macOS puisse s'exécuter :

1. Créer un dépôt GitHub privé nommé `AZZ-DRIVE`.
2. Importer tout le contenu du dossier extrait, y compris le dossier caché `.github`.
3. Ouvrir l'onglet **Actions** du dépôt.
4. Choisir **iOS build check**, puis **Run workflow**.
5. Lire les journaux : le résultat doit être vert pour que la compilation simulateur et les tests aient réussi.

Ne publie jamais de certificat, mot de passe Apple ou clé privée dans le dépôt. Le workflow actuel construit pour le simulateur sans signature et ne permet pas encore d'installer l'app sur un iPhone physique.

## 4. Essai sur iPhone

Pour installer sur un iPhone physique, il faudra une compilation signée avec un compte Apple Developer / une méthode de signature Apple compatible, puis distribuer le build (par exemple via TestFlight). Ce projet n'est pas encore signé ni publié.
