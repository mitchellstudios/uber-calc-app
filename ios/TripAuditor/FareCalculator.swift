import Foundation

// MARK: - Data Structures

struct WaybillData {
    var baseFare: Double?
    var perMinuteRate: Double?
    var perKmRateMin: Double?
    var perKmRateMax: Double?
}

struct TripData {
    var durationMinutes: Double?
    var distanceKm: Double?
    var indentedFare: Double?
}

enum AuditResult: Equatable {
    case withinRange
    case underpaid(Double)
    case overpaid(Double)
}

enum ImageType {
    case waybill
    case tripDetails
    case unknown
}

// MARK: - Fare Calculator

enum FareCalculator {

    // MARK: Rounding

    static func roundToCent(_ value: Double) -> Double {
        (value * 100).rounded() / 100
    }

    // MARK: Dollar Amount Parsing

    /// Matches values with exactly two decimal places, e.g. $1.23 or 1.23.
    /// Intentionally excludes bare integers to avoid capturing time/distance values.
    static func parseDollarAmounts(_ text: String) -> [Double] {
        let pattern = #"\$?\s*[\d,]+\.\d{2}\b"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        let matches = regex.matches(in: text, range: range)
        return matches.compactMap { match -> Double? in
            guard let r = Range(match.range, in: text) else { return nil }
            let raw = String(text[r])
                .replacingOccurrences(of: "$", with: "")
                .replacingOccurrences(of: ",", with: "")
                .trimmingCharacters(in: .whitespaces)
            return Double(raw)
        }
    }

    // MARK: Duration Parsing

    static func parseDuration(_ text: String) -> Double? {
        let lower = text.lowercased()

        let minSecPattern = #"(\d+)\s*min(?:ute)?s?\s+(\d+)\s*sec(?:ond)?s?"#
        if let match = firstMatch(pattern: minSecPattern, in: lower),
           let minutes = groupDouble(match, group: 1, in: lower),
           let seconds = groupDouble(match, group: 2, in: lower) {
            return minutes + seconds / 60.0
        }

        let colonPattern = #"(\d+):(\d+)"#
        if let match = firstMatch(pattern: colonPattern, in: lower),
           let minutes = groupDouble(match, group: 1, in: lower),
           let seconds = groupDouble(match, group: 2, in: lower) {
            return minutes + seconds / 60.0
        }

        let decMinPattern = #"(\d+\.?\d*)\s*min(?:ute)?s?"#
        if let match = firstMatch(pattern: decMinPattern, in: lower),
           let minutes = groupDouble(match, group: 1, in: lower) {
            return minutes
        }

        return nil
    }

    // MARK: Distance Parsing

    static func parseDistance(_ text: String) -> Double? {
        let lower = text.lowercased()
        let pattern = #"(\d+\.?\d*)\s*(?:km|kilometers?|kilometres?)"#
        guard let match = firstMatch(pattern: pattern, in: lower),
              let value = groupDouble(match, group: 1, in: lower) else { return nil }
        return value
    }

    // MARK: Waybill Extraction

    static func extractFromWaybill(_ text: String) -> WaybillData {
        let lower = text.lowercased()
        let amounts = parseDollarAmounts(text)
        var data = WaybillData()

        guard !amounts.isEmpty else { return data }

        if lower.contains("base") && lower.contains("fare") {
            data.baseFare = amounts[0]
        }
        if lower.contains("per") && lower.contains("min") {
            data.perMinuteRate = amounts.count > 1 ? amounts[1] : nil
        }
        if lower.contains("per") && (lower.contains("km") || lower.contains("kilometer") || lower.contains("kilometre")) {
            // Expect two km rates at end: [minKm, maxKm]
            data.perKmRateMin = amounts.count >= 4 ? amounts[amounts.count - 2] : amounts.last
            data.perKmRateMax = amounts.last
        }

        // Positional fallback: base, perMin, minKm, maxKm
        if amounts.count >= 4 {
            if data.baseFare == nil { data.baseFare = amounts[0] }
            if data.perMinuteRate == nil { data.perMinuteRate = amounts[1] }
            if data.perKmRateMin == nil { data.perKmRateMin = amounts[2] }
            if data.perKmRateMax == nil { data.perKmRateMax = amounts[3] }
        } else if amounts.count == 3 {
            // Single km rate — use it for both min and max
            if data.baseFare == nil { data.baseFare = amounts[0] }
            if data.perMinuteRate == nil { data.perMinuteRate = amounts[1] }
            if data.perKmRateMin == nil { data.perKmRateMin = amounts[2] }
            if data.perKmRateMax == nil { data.perKmRateMax = amounts[2] }
        }

        return data
    }

    // MARK: Trip Details Extraction

    static func extractFromTripDetails(_ text: String) -> TripData {
        var data = TripData()

        data.durationMinutes = parseDuration(text)
        data.distanceKm = parseDistance(text)

        let allAmounts = parseDollarAmounts(text)

        let amounts: [Double]
        if let dist = data.distanceKm {
            amounts = allAmounts.filter { $0 != dist }
        } else {
            amounts = allAmounts
        }

        if amounts.count >= 2 {
            data.indentedFare = roundToCent(amounts[1])
        } else if amounts.count == 1 {
            data.indentedFare = roundToCent(amounts[0])
        }

        return data
    }

    // MARK: Calculation

    static func calculateRange(
        baseFare: Double,
        perMinRate: Double,
        perKmRateMin: Double,
        perKmRateMax: Double,
        minutes: Double,
        km: Double
    ) -> (min: Double, max: Double) {
        let base = baseFare + (minutes * perMinRate)
        return (
            min: roundToCent(base + (km * perKmRateMin)),
            max: roundToCent(base + (km * perKmRateMax))
        )
    }

    // MARK: Audit

    static func audit(expectedMin: Double, expectedMax: Double, actual: Double) -> AuditResult {
        if actual < expectedMin - 0.004 {
            return .underpaid(roundToCent(expectedMin - actual))
        } else if actual > expectedMax + 0.004 {
            return .overpaid(roundToCent(actual - expectedMax))
        } else {
            return .withinRange
        }
    }

    // MARK: OCR Text Classification

    static func classifyOcrText(_ text: String) -> ImageType {
        let lower = text.lowercased()
        var waybillScore = 0
        var tripScore = 0

        if lower.contains("waybill") { waybillScore += 5 }
        if lower.contains("base") && lower.contains("fare") { waybillScore += 3 }
        if lower.contains("per") && lower.contains("minute") { waybillScore += 3 }
        if lower.contains("per") && lower.contains("km") { waybillScore += 3 }
        if lower.contains("passenger") { waybillScore += 2 }
        if lower.contains("license plate") { waybillScore += 2 }
        if lower.contains("trip #") { waybillScore += 1 }

        if lower.contains("trip details") { tripScore += 5 }
        if lower.contains("your earnings") { tripScore += 4 }
        if lower.contains("service fee") { tripScore += 3 }
        if lower.contains("duration") { tripScore += 2 }
        if lower.contains("distance") { tripScore += 2 }
        if lower.contains("points earned") { tripScore += 2 }
        if lower.contains("surge") { tripScore += 1 }

        if waybillScore > tripScore { return .waybill }
        if tripScore > waybillScore { return .tripDetails }
        return .unknown
    }

    // MARK: Private Regex Helpers

    private static func firstMatch(pattern: String, in text: String) -> NSTextCheckingResult? {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(text.startIndex..., in: text)
        return regex.firstMatch(in: text, range: range)
    }

    private static func groupDouble(
        _ match: NSTextCheckingResult,
        group: Int,
        in text: String
    ) -> Double? {
        guard match.numberOfRanges > group else { return nil }
        let nsRange = match.range(at: group)
        guard let r = Range(nsRange, in: text) else { return nil }
        return Double(String(text[r]))
    }
}
