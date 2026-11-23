import AVFoundation

/// Annonces vocales. La musique (Spotify ou autre) est baissée pendant l'annonce
/// puis remonte, comme dans Plans ou Waze.
/// Utilisé uniquement depuis le fil principal.
final class SpeechService: NSObject, AVSpeechSynthesizerDelegate, @unchecked Sendable {
    private let synthesizer = AVSpeechSynthesizer()
    var isMuted = false
    var rate: Float = AVSpeechUtteranceDefaultSpeechRate
    var voiceIdentifier: String?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func speak(_ text: String, interrupt: Bool = false) {
        guard !isMuted, !text.isEmpty else { return }
        if interrupt, synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .word) }
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .voicePrompt,
                                 options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers])
        try? session.setActive(true)

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voiceIdentifier.flatMap(AVSpeechSynthesisVoice.init(identifier:))
            ?? AVSpeechSynthesisVoice(language: "fr-FR")
        utterance.rate = rate
        synthesizer.speak(utterance)
    }

    func stop() { synthesizer.stopSpeaking(at: .immediate) }

    static var frenchVoices: [AVSpeechSynthesisVoice] {
        AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("fr") }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        guard !synthesizer.isSpeaking else { return }
        // Rend le volume normal à la musique.
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
