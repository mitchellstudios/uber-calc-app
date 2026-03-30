import SwiftUI

// MARK: - Banner Ad View
//
// To activate real ads:
// 1. Add Google Mobile Ads SDK via Swift Package Manager:
//    https://github.com/googleads/swift-package-manager-google-mobile-ads
// 2. Add your GADApplicationIdentifier key to Info.plist
// 3. Replace the placeholder below with the GADBannerView UIViewRepresentable

struct BannerAdView: View {

    // Replace with your real Ad Unit ID from AdMob console
    // e.g. "ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX"
    static let adUnitID = "ca-app-pub-3940256099942544/2934735716"   // ← test ID

    var body: some View {
        VStack(spacing: 0) {
            Divider()
            ZStack {
                Color(.systemGray6)
                    .frame(height: 50)

                // ── Swap this Text for GADBannerViewRepresentable once SDK is added ──
                Text("Advertisement")
                    .font(.caption2)
                    .foregroundStyle(Color(.systemGray2))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
        }
    }
}

// MARK: - Preview

#Preview {
    VStack {
        Spacer()
        BannerAdView()
    }
}
