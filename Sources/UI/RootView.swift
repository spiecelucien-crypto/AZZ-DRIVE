import MapKit
import SwiftUI

/// Écran unique : la carte en plein écran, et des panneaux qui changent selon l'étape.
struct RootView: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var session: NavigationSession
    @EnvironmentObject private var spotify: SpotifyController
    @EnvironmentObject private var share: TripShareService

    @State private var showSettings = false

    var body: some View {
        ZStack {
            NavigationMapView(session: session, vehicleStyle: settings.vehicleStyle)
                .ignoresSafeArea()

            switch session.phase {
            case .explore:
                ExploreOverlay(showSettings: $showSettings)
            case .preview:
                RoutePreviewOverlay()
            case .navigating:
                NavigatingOverlay()
            case .arrived:
                ArrivalOverlay()
            }

            ToastLayer()
        }
        .animation(.spring(duration: 0.35), value: session.phase)
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
        .onAppear {
            if ProcessInfo.processInfo.arguments.contains("-AZZSettings") { showSettings = true }
        }
    }
}

// MARK: Exploration

private struct ExploreOverlay: View {
    @EnvironmentObject private var session: NavigationSession
    @EnvironmentObject private var spotify: SpotifyController
    @Binding var showSettings: Bool
    @State private var query = ""
    @State private var showSpotify = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "steeringwheel").foregroundStyle(Theme.cyan)
                    Text("AZZ").font(.headline.weight(.black)) + Text(" DRIVE").font(.headline.weight(.black)).foregroundColor(Theme.cyan)
                }
                .padding(.horizontal, 14).frame(height: 44)
                .panel(radius: 14)
                Spacer()
                RoundButton(systemName: "gearshape.fill", size: 44, label: "Réglages") { showSettings = true }
            }

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Theme.muted)
                TextField("Où allez-vous ?", text: $query)
                    .focused($focused)
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                    .onSubmit { session.search(query) }
                if session.isBusy { ProgressView().controlSize(.small) }
                if !query.isEmpty {
                    Button { query = ""; session.clearSearch() } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.muted)
                    }
                    .accessibilityLabel("Effacer")
                }
            }
            .padding(.horizontal, 14).frame(height: 52)
            .panel(radius: 16)

            if !session.searchResults.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(session.searchResults.enumerated()), id: \.offset) { index, item in
                        Button {
                            focused = false
                            session.preview(item)
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "mappin.circle.fill").font(.title2).foregroundStyle(Theme.cyan)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.name ?? "Destination").foregroundStyle(.white).lineLimit(1)
                                    Text(item.placemark.title ?? "").font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                                }
                                Spacer()
                            }
                            .padding(.horizontal, 14).padding(.vertical, 10)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if index < session.searchResults.count - 1 { Divider().overlay(Theme.line) }
                    }
                }
                .panel(radius: 16)
            }

            Spacer()

            HStack(alignment: .bottom) {
                if spotify.isConnected { SpotifyMiniPlayer(onExpand: { showSpotify = true }).frame(maxWidth: 320) }
                Spacer()
                RoundButton(systemName: "location.fill", tint: Theme.cyan, label: "Me localiser") { session.recenter() }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 16)
        .transition(.opacity)
        .sheet(isPresented: $showSpotify) { SpotifyBrowserView().presentationDetents([.medium, .large]) }
    }
}

// MARK: Aperçu des itinéraires

private struct RoutePreviewOverlay: View {
    @EnvironmentObject private var session: NavigationSession
    @EnvironmentObject private var settings: AppSettings

    var body: some View {
        VStack {
            HStack {
                RoundButton(systemName: "chevron.left", size: 44, label: "Retour") { session.cancelPreview() }
                Spacer()
            }
            Spacer()
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.destination?.name ?? "Destination").font(.title3.weight(.bold)).lineLimit(1)
                    Text(session.destination?.placemark.title ?? "").font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                }

                ForEach(session.routes) { route in
                    let selected = route.id == session.selectedRoute?.id
                    Button { session.selectedRouteID = route.id } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(NavFormat.duration(route.expectedTravelTime))
                                    .font(.title3.weight(.bold)).foregroundStyle(selected ? Theme.cyan : .white)
                                Text("\(NavFormat.distance(route.distance)) · via \(route.name)")
                                    .font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                            }
                            Spacer()
                            Text("Arrivée \(ETAFormat.arrival(in: route.expectedTravelTime))")
                                .font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                        }
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 14).fill(selected ? Theme.cyan.opacity(0.12) : .clear))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(selected ? Theme.cyan : Theme.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }

                Toggle(isOn: $settings.simulateDrive) {
                    Label("Conduite simulée", systemImage: "play.circle")
                        .font(.subheadline)
                }

                Button(action: session.start) {
                    Label("Démarrer", systemImage: "location.north.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .background(Theme.cyan, in: RoundedRectangle(cornerRadius: 14))
                        .foregroundStyle(Theme.background)
                }
                .buttonStyle(.plain)
            }
            .padding(16)
            .panel(radius: 24)
        }
        .padding(16)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

// MARK: Arrivée

private struct ArrivalOverlay: View {
    @EnvironmentObject private var session: NavigationSession

    var body: some View {
        VStack {
            Spacer()
            VStack(spacing: 12) {
                Image(systemName: "flag.checkered.circle.fill").font(.system(size: 48)).foregroundStyle(Theme.green)
                Text("Vous êtes arrivé").font(.title2.weight(.bold))
                Text(session.destination?.name ?? "").foregroundStyle(Theme.muted)
                Button("Terminer") { session.dismissArrival() }
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(Theme.cyan, in: RoundedRectangle(cornerRadius: 14))
                    .foregroundStyle(Theme.background)
            }
            .padding(20)
            .panel(radius: 24)
        }
        .padding(16)
    }
}

// MARK: Messages

private struct ToastLayer: View {
    @EnvironmentObject private var session: NavigationSession
    @EnvironmentObject private var spotify: SpotifyController
    @EnvironmentObject private var share: TripShareService

    var body: some View {
        VStack {
            if let text = session.message ?? spotify.errorMessage ?? share.errorMessage {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "info.circle.fill").foregroundStyle(Theme.cyan)
                    Text(text).font(.subheadline).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    Button {
                        clear()
                    } label: { Image(systemName: "xmark").foregroundStyle(Theme.muted) }
                    .accessibilityLabel("Fermer")
                }
                .padding(14)
                .panel(radius: 16)
                .padding(.horizontal, 16)
                .padding(.top, 120)
                .transition(.move(edge: .top).combined(with: .opacity))
                .task(id: text) {
                    try? await Task.sleep(nanoseconds: 5_000_000_000)
                    clear()
                }
            }
            Spacer()
        }
        .animation(.easeOut(duration: 0.25), value: session.message ?? spotify.errorMessage ?? share.errorMessage)
    }

    private func clear() {
        session.message = nil
        spotify.errorMessage = nil
        share.errorMessage = nil
    }
}
