
import SwiftUI
import MapKit
import CoreLocation
import AVFoundation

final class LocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()

    @Published var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 50.30, longitude: 3.95),
        span: MKCoordinateSpan(latitudeDelta: 0.08, longitudeDelta: 0.08)
    )

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func request() {
        manager.requestWhenInUseAuthorization()
        manager.requestLocation()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .authorizedWhenInUse ||
            manager.authorizationStatus == .authorizedAlways {
            manager.requestLocation()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        if let coordinate = locations.first?.coordinate {
            region.center = coordinate
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}

private struct DestinationAnnotation: Identifiable {
    let id = UUID()
    let item: MKMapItem
}

struct NavigationView: View {
    @StateObject private var location = LocationManager()
    @State private var destination = ""
    @State private var results: [MKMapItem] = []
    @State private var selected: MKMapItem?
    @State private var status = "Prêt à partir"

    private let speech = AVSpeechSynthesizer()

    var body: some View {
        ZStack(alignment: .top) {
            Map(
                coordinateRegion: $location.region,
                showsUserLocation: true,
                annotationItems: selected.map { [DestinationAnnotation(item: $0)] } ?? []
            ) { annotation in
                MapMarker(
                    coordinate: annotation.item.placemark.coordinate,
                    tint: .red
                )
            }
            .ignoresSafeArea()

            VStack(spacing: 12) {
                HStack {
                    Image(systemName: "steeringwheel")
                        .font(.title2)

                    Text("AZZ DRIVE")
                        .font(.headline)
                        .bold()

                    Spacer()

                    Text("BÊTA")
                        .font(.caption2)
                        .bold()
                }
                .padding()
                .background(.regularMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 16))

                HStack {
                    TextField("Où souhaitez-vous aller ?", text: $destination)
                        .textFieldStyle(.roundedBorder)
                        .submitLabel(.search)
                        .onSubmit(search)

                    Button(action: search) {
                        Image(systemName: "magnifyingglass")
                            .padding(10)
                            .background(.blue)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }

                if !results.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(results.indices, id: \.self) { index in
                            Button {
                                choose(results[index])
                            } label: {
                                VStack(alignment: .leading) {
                                    Text(results[index].name ?? "Destination")
                                        .foregroundStyle(.primary)

                                    Text(results[index].placemark.title ?? "")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10)
                            }

                            Divider()
                        }
                    }
                    .background(.regularMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                Spacer()

                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(status)
                            .font(.headline)

                        Text("Carte et calcul d'itinéraire Apple Plans")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Button(action: location.request) {
                        Image(systemName: "location.fill")
                            .font(.title2)
                            .padding(14)
                            .background(.blue)
                            .foregroundStyle(.white)
                            .clipShape(Circle())
                    }
                }
                .padding()
                .background(.regularMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            .padding()
        }
        .onAppear(perform: location.request)
    }

    private func search() {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = destination
        request.region = location.region

        MKLocalSearch(request: request).start { response, _ in
            results = Array((response?.mapItems ?? []).prefix(5))
        }
    }

    private func choose(_ item: MKMapItem) {
        selected = item
        results = []
        destination = item.name ?? destination

        let request = MKDirections.Request()
        request.source = MKMapItem(
            placemark: MKPlacemark(coordinate: location.region.center)
        )
        request.destination = item
        request.transportType = .automobile

        MKDirections(request: request).calculate { response, _ in
            guard let route = response?.routes.first else {
                status = "Itinéraire indisponible"
                return
            }

            let minutes = Int(route.expectedTravelTime / 60)

            status = String(
                format: "%.1f km • environ %d min",
                route.distance / 1000,
                minutes
            )

            let utterance = AVSpeechUtterance(
                string: "Itinéraire calculé. Environ \(minutes) minutes."
            )
            utterance.voice = AVSpeechSynthesisVoice(language: "fr-FR")
            speech.speak(utterance)

            let url = URL(
                string: "https://maps.apple.com/?daddr=\(item.placemark.coordinate.latitude),\(item.placemark.coordinate.longitude)&dirflg=d"
            )!

            UIApplication.shared.open(url)
        }
    }
}
