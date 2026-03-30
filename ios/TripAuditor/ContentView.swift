import SwiftUI
import PhotosUI

// MARK: - Content View

struct ContentView: View {

    // MARK: Image State

    @State private var image1Item: PhotosPickerItem?
    @State private var image2Item: PhotosPickerItem?
    @State private var image1: UIImage?
    @State private var image2: UIImage?
    @State private var image1Label: String = ""
    @State private var image2Label: String = ""

    // MARK: Extracted Field State

    @State private var baseFare: String = ""
    @State private var perMinuteRate: String = ""
    @State private var perKmRateMin: String = ""
    @State private var perKmRateMax: String = ""
    @State private var durationMinutes: String = ""
    @State private var distanceKm: String = ""
    @State private var indentedFare: String = ""

    // MARK: Results State

    @State private var expectedFareMin: Double?
    @State private var expectedFareMax: Double?
    @State private var actualFare: Double?
    @State private var auditResult: AuditResult?

    // MARK: UI State

    @State private var isExtracting = false
    @State private var alertMessage = ""
    @State private var showAlert = false

    // MARK: Brand Color

    private let brandBlue = Color(red: 0x25 / 255.0, green: 0x63 / 255.0, blue: 0xEB / 255.0)

    private var hasImages: Bool { image1 != nil || image2 != nil }

    // MARK: Body

    var body: some View {
        VStack(spacing: 0) {
            NavigationStack {
                ScrollView {
                    VStack(spacing: 16) {
                        resultsCard
                        screenshotsCard
                        waybillCard
                        tripDetailsCard
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 20)
                }
                .background(Color(.systemGroupedBackground))
                .navigationTitle("FareWise")
                .navigationBarTitleDisplayMode(.large)
                .toolbar {
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button("Done") { hideKeyboard() }
                    }
                }
                .alert("Notice", isPresented: $showAlert) {
                    Button("OK", role: .cancel) {}
                } message: {
                    Text(alertMessage)
                }
            }

            BannerAdView()
        }
        .ignoresSafeArea(.keyboard)
    }

    // MARK: - Cards

    private var resultsCard: some View {
        card {
            VStack(alignment: .leading, spacing: 12) {
                sectionHeader("Results")

                Button {
                    Task { await extractAndCalculate() }
                } label: {
                    HStack {
                        if isExtracting {
                            ProgressView()
                                .progressViewStyle(.circular)
                                .tint(.white)
                                .padding(.trailing, 4)
                        }
                        Text(isExtracting ? "Extracting..." : "Calculate & Audit")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(isExtracting ? Color(.systemGray3) : brandBlue)
                    .foregroundStyle(.white)
                    .cornerRadius(10)
                }
                .disabled(isExtracting)

                VStack(spacing: 0) {
                    resultRow(
                        label: "Expected Range",
                        value: expectedRangeText
                    )
                    Divider().padding(.horizontal, 12)
                    resultRow(
                        label: "Actual Indented Fare",
                        value: actualFare.map { formatMoney($0) } ?? "—"
                    )
                    Divider().padding(.horizontal, 12)
                    HStack {
                        Text("Result")
                            .font(.subheadline)
                            .foregroundStyle(Color(.secondaryLabel))
                        Spacer()
                        auditLabel
                            .font(.subheadline.weight(.semibold))
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                }
                .background(Color(.systemGray6))
                .cornerRadius(10)

                Button {
                    clearAll()
                } label: {
                    Text("Clear All")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.clear)
                        .foregroundStyle(brandBlue)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(brandBlue, lineWidth: 1.5)
                        )
                        .cornerRadius(10)
                }
            }
        }
    }

    private var screenshotsCard: some View {
        card {
            VStack(alignment: .leading, spacing: 12) {
                sectionHeader("Screenshots")

                Text("Upload both screenshots in any order — auto-detected")
                    .font(.caption)
                    .foregroundStyle(Color(.systemGray))

                HStack(spacing: 12) {
                    VStack(spacing: 4) {
                        PhotosPicker(selection: $image1Item, matching: .images) {
                            imageBox(image: image1)
                        }
                        .buttonStyle(.plain)
                        if !image1Label.isEmpty {
                            detectedLabel(image1Label)
                        }
                    }

                    VStack(spacing: 4) {
                        PhotosPicker(selection: $image2Item, matching: .images) {
                            imageBox(image: image2)
                        }
                        .buttonStyle(.plain)
                        if !image2Label.isEmpty {
                            detectedLabel(image2Label)
                        }
                    }
                }
            }
        }
        .onChange(of: image1Item) { _, newItem in
            loadImage(from: newItem) { image1 = $0 }
        }
        .onChange(of: image2Item) { _, newItem in
            loadImage(from: newItem) { image2 = $0 }
        }
    }

    private var waybillCard: some View {
        card {
            VStack(alignment: .leading, spacing: 12) {
                sectionHeader("From Waybill")
                numberField("Base Fare ($)", text: $baseFare)
                numberField("Per Minute Rate ($)", text: $perMinuteRate)
                numberField("Min Per KM Rate ($)", text: $perKmRateMin)
                numberField("Max Per KM Rate ($)", text: $perKmRateMax)
            }
        }
    }

    private var tripDetailsCard: some View {
        card {
            VStack(alignment: .leading, spacing: 12) {
                sectionHeader("From Trip Details")

                VStack(alignment: .leading, spacing: 4) {
                    numberField("Duration (minutes)", text: $durationMinutes)
                    Text("e.g. 12 min 34 sec -> 12.57")
                        .font(.caption2)
                        .foregroundStyle(Color(.systemGray))
                        .padding(.leading, 4)
                }

                numberField("Distance (km)", text: $distanceKm)
                numberField("Indented Fare ($)", text: $indentedFare)
            }
        }
    }

    // MARK: - Helper Views

    @ViewBuilder
    private func imageBox(image: UIImage?) -> some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity, minHeight: 110)
                    .clipped()
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.green, lineWidth: 2)
                    )
            } else {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color(.systemGray3), style: StrokeStyle(lineWidth: 1.5, dash: [6]))
                    .frame(maxWidth: .infinity, minHeight: 110)
                    .overlay(
                        VStack(spacing: 6) {
                            Image(systemName: "photo.badge.plus")
                                .font(.title2)
                                .foregroundStyle(Color(.systemGray2))
                            Text("Tap to select")
                                .font(.caption)
                                .foregroundStyle(Color(.systemGray))
                        }
                    )
            }
        }
        .frame(maxWidth: .infinity, minHeight: 110)
    }

    private func detectedLabel(_ text: String) -> some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(text == "Waybill" ? Color.purple : Color.cyan)
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.headline)
            .foregroundStyle(Color(.label))
    }

    private func numberField(_ label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(Color(.secondaryLabel))
            TextField("0.00", text: text)
                .keyboardType(.decimalPad)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Color(.systemGray6))
                .cornerRadius(8)
                .onChange(of: text.wrappedValue) { _, _ in
                    calculateAndAudit()
                }
        }
    }

    private func resultRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(Color(.secondaryLabel))
            Spacer()
            Text(value)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Color(.label))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    private var expectedRangeText: String {
        guard let min = expectedFareMin, let max = expectedFareMax else { return "—" }
        return "\(formatMoney(min)) – \(formatMoney(max))"
    }

    @ViewBuilder
    private var auditLabel: some View {
        if let result = auditResult {
            switch result {
            case .withinRange:
                Text("Within Range — Correct")
                    .foregroundStyle(.green)
            case .underpaid(let diff):
                Text("Underpaid by \(formatMoney(diff))")
                    .foregroundStyle(.red)
            case .overpaid(let diff):
                Text("Overpaid by \(formatMoney(diff))")
                    .foregroundStyle(brandBlue)
            }
        } else {
            Text("—")
                .foregroundStyle(Color(.systemGray))
        }
    }

    // MARK: Card Container

    private func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            content()
        }
        .padding(16)
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: Color(.sRGBLinear, white: 0, opacity: 0.06), radius: 4, x: 0, y: 2)
    }

    // MARK: - Formatting

    private func formatMoney(_ value: Double) -> String {
        String(format: "$%.2f", value)
    }

    // MARK: - Actions

    private func extractAndCalculate() async {
        if hasImages {
            await extractFromImages()
        } else {
            calculateAndAudit()
        }
    }

    private func extractFromImages() async {
        guard !isExtracting else { return }

        isExtracting = true
        defer { isExtracting = false }

        image1Label = ""
        image2Label = ""

        struct OCRResult {
            let index: Int
            let text: String
            let type: ImageType
        }

        let imgs = [image1, image2]
        var ocrResults: [OCRResult] = []

        await withTaskGroup(of: OCRResult?.self) { group in
            for (i, img) in imgs.enumerated() {
                if let img {
                    group.addTask {
                        let text = await OCRService.recognize(image: img)
                        guard !text.isEmpty else { return nil }
                        return OCRResult(index: i, text: text, type: FareCalculator.classifyOcrText(text))
                    }
                }
            }
            for await result in group {
                if let result { ocrResults.append(result) }
            }
        }
        ocrResults.sort { $0.index < $1.index }

        var waybillText: String?
        var tripText: String?
        var waybillIdx = -1
        var tripIdx = -1

        for r in ocrResults {
            if r.type == .waybill && waybillText == nil {
                waybillText = r.text; waybillIdx = r.index
            } else if r.type == .tripDetails && tripText == nil {
                tripText = r.text; tripIdx = r.index
            }
        }

        if ocrResults.count == 2 {
            if waybillText != nil && tripText == nil {
                if let other = ocrResults.first(where: { $0.index != waybillIdx }) {
                    tripText = other.text; tripIdx = other.index
                }
            } else if tripText != nil && waybillText == nil {
                if let other = ocrResults.first(where: { $0.index != tripIdx }) {
                    waybillText = other.text; waybillIdx = other.index
                }
            } else if waybillText == nil && tripText == nil {
                waybillText = ocrResults[0].text; waybillIdx = ocrResults[0].index
                tripText = ocrResults[1].text; tripIdx = ocrResults[1].index
            }
        }

        if waybillIdx == 0 { image1Label = "Waybill" }
        else if waybillIdx == 1 { image2Label = "Waybill" }
        if tripIdx == 0 { image1Label = "Trip Details" }
        else if tripIdx == 1 { image2Label = "Trip Details" }

        var populated = false

        if let wText = waybillText {
            let w = FareCalculator.extractFromWaybill(wText)
            if let v = w.baseFare { baseFare = String(format: "%.2f", v); populated = true }
            if let v = w.perMinuteRate { perMinuteRate = String(format: "%.4f", v); populated = true }
            if let v = w.perKmRateMin { perKmRateMin = String(format: "%.4f", v); populated = true }
            if let v = w.perKmRateMax { perKmRateMax = String(format: "%.4f", v); populated = true }
        }

        if let tText = tripText {
            let t = FareCalculator.extractFromTripDetails(tText)
            if let v = t.durationMinutes { durationMinutes = String(format: "%.4f", v); populated = true }
            if let v = t.distanceKm { distanceKm = String(format: "%.2f", v); populated = true }
            if let v = t.indentedFare { indentedFare = String(format: "%.2f", v); populated = true }
        }

        if !populated {
            alertMessage = "Could not extract values from the screenshots. Please enter values manually."
            showAlert = true
        }

        calculateAndAudit()
    }

    private func calculateAndAudit() {
        let base = Double(baseFare) ?? 0
        let perMin = Double(perMinuteRate) ?? 0
        let minKm = Double(perKmRateMin) ?? 0
        let maxKm = Double(perKmRateMax) ?? 0
        let mins = Double(durationMinutes) ?? 0
        let km = Double(distanceKm) ?? 0
        let actualRaw = Double(indentedFare)
        let hasActual = actualRaw != nil && !indentedFare.trimmingCharacters(in: .whitespaces).isEmpty

        let hasRates = (perMin > 0 || minKm > 0 || maxKm > 0) && (mins > 0 || km > 0)

        if !hasRates && base == 0 {
            expectedFareMin = nil
            expectedFareMax = nil
            actualFare = hasActual ? FareCalculator.roundToCent(actualRaw!) : nil
            auditResult = nil
            return
        }

        let range = FareCalculator.calculateRange(
            baseFare: base,
            perMinRate: perMin,
            perKmRateMin: minKm,
            perKmRateMax: maxKm,
            minutes: mins,
            km: km
        )
        expectedFareMin = range.min
        expectedFareMax = range.max
        actualFare = hasActual ? FareCalculator.roundToCent(actualRaw!) : nil

        if let actual = actualFare {
            auditResult = FareCalculator.audit(
                expectedMin: range.min,
                expectedMax: range.max,
                actual: actual
            )
        } else {
            auditResult = nil
        }
    }

    private func clearAll() {
        image1Item = nil; image2Item = nil
        image1 = nil; image2 = nil
        image1Label = ""; image2Label = ""
        baseFare = ""; perMinuteRate = ""
        perKmRateMin = ""; perKmRateMax = ""
        durationMinutes = ""; distanceKm = ""; indentedFare = ""
        expectedFareMin = nil; expectedFareMax = nil
        actualFare = nil; auditResult = nil
    }

    private func loadImage(from item: PhotosPickerItem?, completion: @escaping (UIImage?) -> Void) {
        guard let item else { completion(nil); return }
        item.loadTransferable(type: Data.self) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let data):
                    completion(data.flatMap { UIImage(data: $0) })
                case .failure:
                    completion(nil)
                }
            }
        }
    }

    private func hideKeyboard() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil, from: nil, for: nil
        )
    }
}

// MARK: - Preview

#Preview {
    ContentView()
}
