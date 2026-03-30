import SwiftUI

struct SplashView: View {

    @State private var logoScale: CGFloat = 0.6
    @State private var logoOpacity: Double = 0
    @State private var textOpacity: Double = 0
    @State private var textOffset: CGFloat = 30

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [
                    Color(red: 0x1e/255, green: 0x3a/255, blue: 0x8a/255),
                    Color(red: 0x25/255, green: 0x63/255, blue: 0xeb/255),
                    Color(red: 0x3b/255, green: 0x82/255, blue: 0xf6/255)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Logo
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.15))
                        .frame(width: 140, height: 140)

                    VStack(spacing: 2) {
                        Image(systemName: "car.fill")
                            .font(.system(size: 52, weight: .semibold))
                            .foregroundStyle(.white)
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 22, weight: .bold))
                            .foregroundStyle(.white.opacity(0.85))
                    }
                }
                .scaleEffect(logoScale)
                .opacity(logoOpacity)
                .shadow(color: .black.opacity(0.25), radius: 24, x: 0, y: 8)
                .padding(.bottom, 28)

                // Title
                Text("FareWise")
                    .font(.system(size: 42, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.15), radius: 8, x: 0, y: 2)
                    .padding(.bottom, 8)
                    .opacity(textOpacity)
                    .offset(y: textOffset)

                // Subtitle
                Text("Ride-Share Fare Auditor")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(.white.opacity(0.75))
                    .tracking(0.4)
                    .opacity(textOpacity)
                    .offset(y: textOffset)

                Spacer()
                Spacer()
            }
        }
        .onAppear {
            withAnimation(.spring(response: 0.7, dampingFraction: 0.65)) {
                logoScale = 1.0
                logoOpacity = 1.0
            }
            withAnimation(.easeOut(duration: 0.6).delay(0.25)) {
                textOpacity = 1.0
                textOffset = 0
            }
        }
    }
}

#Preview {
    SplashView()
}
