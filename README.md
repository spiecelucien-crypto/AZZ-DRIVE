# AZZ DRIVE — prototype iOS natif

AZZ DRIVE est une application iPhone SwiftUI (iOS 17+), pas un site web. Le code peut être consulté et modifié depuis Windows. La génération du projet Xcode, la compilation, la signature et l'installation iOS nécessitent macOS/Xcode ou un service Mac distant.

## Fonctions présentes dans cette base
- Carte MapKit, position GPS et permissions pendant l'utilisation.
- Recherche d'adresses et de lieux via les suggestions Apple Maps.
- Calcul d'itinéraires automobiles alternatifs, choix du trajet, préférences pour éviter péages et autoroutes.
- Synthèse vocale française avec sélection de voix système et réglage de vitesse.
- Reconnaissance vocale française déclenchée par le bouton micro. Commandes : « emmène-moi à … », « arrête la navigation », « reprends la navigation », « répète », « où suis-je ».
- Progression expérimentale des étapes selon la proximité GPS, répétition d'instruction et recentrage de la carte pendant la navigation.
- Favoris et destinations récentes, stockés localement.
- Signalements locaux (accident, danger, travaux, ralentissement, route fermée, contrôle signalé) avec expiration automatique et précision facultative.
- Réglages de voix, itinéraire et confidentialité.
- Manifeste de confidentialité iOS et tests unitaires initiaux.
- Workflow GitHub Actions pour générer et compiler le projet sur un runner macOS.

## Limites connues — pas encore prêt pour la route
- Le guidage n'est pas encore fiable : la progression d'étapes repose sur une proximité GPS simple, sans map-matching robuste, sans recalcul automatique en cas de sortie d'itinéraire et sans annonces anticipées correctement calibrées.
- Le suivi en arrière-plan n'est pas activé. La navigation peut donc être interrompue lorsque l'application passe en arrière-plan.
- Les signalements ne sont ni synchronisés ni partagés. Ils ne sont pas modérés et les contrôles signalés ne sont pas vérifiés.
- Pas de trafic communautaire temps réel, de comptes, de serveur, de copilote IA conversationnel, de widgets, de Live Activities ni de CarPlay.
- MapKit fournit des itinéraires Apple, pas les données communautaires de Waze.
- Aucune compilation Xcode ni validation sur iPhone réel n'a encore été exécutée dans cet environnement. L'approbation CarPlay et App Store n'est pas garantie.

## Ouvrir et compiler
1. Sur un Mac, installer Xcode et XcodeGen (`brew install xcodegen`).
2. Dans ce dossier, lancer `xcodegen generate`.
3. Ouvrir `AZZ-DRIVE.xcodeproj` dans Xcode.
4. Choisir une équipe de signature Apple et un simulateur ou iPhone de test.
5. Compiler et exécuter les tests. Vérifier les autorisations de localisation, microphone et reconnaissance vocale.

Le fichier `project.yml` est la source de configuration XcodeGen. Aucune clé secrète n'est incluse dans l'application.

## Contrôle depuis Windows
Consulter `WINDOWS-TEST.md` et lancer `scripts/Verify-AZZ-DRIVE.ps1`. Ce contrôle vérifie la présence des fichiers et le manifeste XML ; il ne compile pas l'application. Le workflow GitHub Actions réalise la compilation simulateur sur macOS, sans signature pour iPhone physique.
