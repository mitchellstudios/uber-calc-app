var tripAuditorInitialized = false;

function initTripAuditor() {
    if (tripAuditorInitialized) return;

    var root = document.getElementById('trip-auditor-root');
    if (!root) {
        if (document.readyState !== 'complete') setTimeout(initTripAuditor, 100);
        return;
    }

    var waybillInput = root.querySelector('#waybillInput');
    var tripDetailsInput = root.querySelector('#tripDetailsInput');
    var waybillPreview = root.querySelector('#waybillPreview');
    var tripDetailsPreview = root.querySelector('#tripDetailsPreview');
    var extractBtn = root.querySelector('#extractBtn');
    var calculateBtn = root.querySelector('#calculateBtn');
    var clearBtn = root.querySelector('#clearBtn');
    var baseFare = root.querySelector('#baseFare');
    var perMinuteRate = root.querySelector('#perMinuteRate');
    var perKmRate = root.querySelector('#perKmRate');
    var duration = root.querySelector('#duration');
    var distance = root.querySelector('#distance');
    var indentedFare = root.querySelector('#indentedFare');
    var expectedFareEl = root.querySelector('#expectedFare');
    var actualFareEl = root.querySelector('#actualFare');
    var resultEl = root.querySelector('#result');

    if (!waybillInput || !tripDetailsInput || !waybillPreview || !tripDetailsPreview || !extractBtn) {
        if (document.readyState === 'complete') {
            console.error('Trip Auditor: Required elements not found.');
        } else {
            setTimeout(initTripAuditor, 100);
        }
        return;
    }

    let waybillFile = null;
    let tripDetailsFile = null;

    // File upload & preview (JPG and PNG only)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    const allowedExt = /\.(jpe?g|png)$/i;

    function isValidImage(file) {
        return allowedTypes.includes(file.type) || allowedExt.test(file.name);
    }

    function setupFileInput(input, preview, setFile) {
        if (!input || !preview) return;
        try {
            preview.addEventListener('click', function() { if (input) input.click(); });
            input.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                if (!isValidImage(file)) {
                    alert('Please upload only JPG or PNG images.');
                    input.value = '';
                    return;
                }
                setFile(file);
                const reader = new FileReader();
                reader.onload = (ev) => {
                    preview.innerHTML = `<img src="${ev.target.result}" alt="Preview">`;
                };
                reader.readAsDataURL(file);
            }
        });
        } catch (err) {
            console.error('Trip Auditor setup error:', err);
        }
    }

    function updateExtractButton() {
        if (extractBtn) extractBtn.disabled = !waybillFile && !tripDetailsFile;
    }

    if (waybillInput && waybillPreview) setupFileInput(waybillInput, waybillPreview, function(f) { waybillFile = f; updateExtractButton(); });
    if (tripDetailsInput && tripDetailsPreview) setupFileInput(tripDetailsInput, tripDetailsPreview, function(f) { tripDetailsFile = f; updateExtractButton(); });

    // Round to exact cents (no floating-point drift)
    function roundToCent(n) {
        if (typeof n !== 'number' || isNaN(n)) return n;
        return Math.round(n * 100) / 100;
    }

    // Parse dollar amounts from OCR text (only values that look like currency: $X.XX or X.XX)
    // Excludes integers like 5, 45, 4, 409 so we don't pull in time, capacity, battery, etc.
    function parseDollarAmounts(text) {
        const matches = text.match(/\$?\s*[\d,]+\.\d{2}\b/g) || [];
        return matches.map(m => parseFloat(m.replace(/[$,]/g, ''))).filter(n => !isNaN(n));
    }

    // Parse duration (e.g. "12 min 34 sec" or "12:34" or "12 min") to decimal minutes
    function parseDuration(text) {
        // "12 min 34 sec" or "12 min 34 secs"
        const minSec = text.match(/(\d+)\s*min(?:ute)?s?\s*(\d+)\s*sec(?:ond)?s?/i);
        if (minSec) return parseFloat(minSec[1]) + parseFloat(minSec[2]) / 60;

        // "12:34" (minutes:seconds)
        const colon = text.match(/(\d+):(\d+)/);
        if (colon) return parseFloat(colon[1]) + parseFloat(colon[2]) / 60;

        // "12.5 min" or "12 min"
        const decimal = text.match(/(\d+\.?\d*)\s*min(?:ute)?s?/i);
        if (decimal) return parseFloat(decimal[1]);

        return null;
    }

    // Parse distance in km
    function parseDistance(text) {
        const match = text.match(/(\d+\.?\d*)\s*(?:km|kilometer|kilometre)s?/i);
        return match ? parseFloat(match[1]) : null;
    }

    // Extract from Waybill: Base Fare, Per Minute rate, Per km rate
    function extractFromWaybill(text) {
        const amounts = parseDollarAmounts(text);
        const lower = text.toLowerCase();

        let base = null, perMin = null, perKm = null;

        // Look for labels near amounts (OCR often keeps order)
        if (lower.includes('base') && lower.includes('fare')) base = amounts[0];
        if (lower.includes('per') && lower.includes('min')) perMin = amounts.find((_, i) => i > 0) ?? amounts[1];
        if (lower.includes('per') && (lower.includes('km') || lower.includes('kilometer'))) perKm = amounts[amounts.length - 1] ?? amounts[2];

        // Fallback: use first 3 amounts as base, per min, per km
        if (amounts.length >= 3 && (!base || !perMin || !perKm)) {
            base = base ?? amounts[0];
            perMin = perMin ?? amounts[1];
            perKm = perKm ?? amounts[2];
        }

        return { baseFare: base, perMinuteRate: perMin, perKmRate: perKm };
    }

    // Extract from Trip Details: Duration, Distance, first Indented Fare
    // First indented fare = the amount directly under the top "Fare" total (second amount in order)
    function extractFromTripDetails(text) {
        const durationVal = parseDuration(text);
        const distanceVal = parseDistance(text);
        const amounts = parseDollarAmounts(text);
        const indentedFareVal = amounts.length >= 2 ? amounts[1] : amounts[0];

        return {
            duration: durationVal,
            distance: distanceVal,
            indentedFare: indentedFareVal != null ? roundToCent(indentedFareVal) : null
        };
    }

    // Extract from screenshots using Tesseract
    async function extractFromScreenshots() {
        if (typeof Tesseract === 'undefined') {
            alert('OCR library is still loading. Please wait a moment and try again.');
            return;
        }
        if (!waybillFile && !tripDetailsFile) {
            alert('Please upload at least one screenshot (Waybill or Trip Details).');
            return;
        }

        extractBtn.disabled = true;
        extractBtn.textContent = 'Extracting...';

        try {
            const worker = await Tesseract.createWorker();
            await worker.loadLanguage('eng');
            await worker.initialize('eng');

            if (waybillFile) {
                const { data: { text } } = await worker.recognize(waybillFile);
                const w = extractFromWaybill(text);
                if (w.baseFare != null) baseFare.value = w.baseFare;
                if (w.perMinuteRate != null) perMinuteRate.value = w.perMinuteRate;
                if (w.perKmRate != null) perKmRate.value = w.perKmRate;
            }

            if (tripDetailsFile) {
                const { data: { text } } = await worker.recognize(tripDetailsFile);
                const t = extractFromTripDetails(text);
                if (t.duration != null) duration.value = t.duration.toFixed(2);
                if (t.distance != null) distance.value = t.distance;
                if (t.indentedFare != null) indentedFare.value = String(t.indentedFare);
            }

            await worker.terminate();
            alert('Extraction complete. Please verify the values and adjust if needed.');
        } catch (err) {
            console.error(err);
            alert('Extraction failed. Please enter the values manually.');
        } finally {
            extractBtn.disabled = false;
            extractBtn.textContent = 'Extract from Screenshots';
        }
    }

    // Calculation: Expected Fare = Base + (Minutes * PerMinRate) + (km * PerKmRate)
    function calculateAndAudit() {
        const base = parseFloat(baseFare.value) || 0;
        const perMin = parseFloat(perMinuteRate.value) || 0;
        const perKm = parseFloat(perKmRate.value) || 0;
        const mins = parseFloat(duration.value) || 0;
        const km = parseFloat(distance.value) || 0;
        const actual = parseFloat(indentedFare.value);

        const hasRates = (perMin > 0 || perKm > 0) && (mins > 0 || km > 0);
        const hasActual = !isNaN(actual) && indentedFare.value.trim() !== '';

        if (!hasRates && base === 0) {
            expectedFareEl.textContent = '$—';
            actualFareEl.textContent = hasActual ? `$${roundToCent(actual).toFixed(2)}` : '$—';
            resultEl.textContent = '—';
            resultEl.className = '';
            return;
        }

        const expected = roundToCent(base + (mins * perMin) + (km * perKm));

        expectedFareEl.textContent = `$${expected.toFixed(2)}`;
        actualFareEl.textContent = hasActual ? `$${roundToCent(actual).toFixed(2)}` : '$—';

        if (!hasActual) {
            resultEl.textContent = '—';
            resultEl.className = '';
            return;
        }

        const actualRounded = roundToCent(actual);
        const diff = roundToCent(actualRounded - expected);
        if (Math.abs(diff) < 0.005) {
            resultEl.textContent = 'Match';
            resultEl.className = 'result-match';
        } else if (diff < 0) {
            resultEl.textContent = `Underpaid by $${Math.abs(diff).toFixed(2)}`;
            resultEl.className = 'result-underpaid';
        } else {
            resultEl.textContent = `Overpaid by $${roundToCent(diff).toFixed(2)}`;
            resultEl.className = 'result-overpaid';
        }
    }

    function clearAll() {
        waybillFile = null;
        tripDetailsFile = null;
        if (waybillInput) waybillInput.value = '';
        if (tripDetailsInput) tripDetailsInput.value = '';
        if (waybillPreview) waybillPreview.innerHTML = '<span class="upload-placeholder">Drop or select image</span>';
        if (tripDetailsPreview) tripDetailsPreview.innerHTML = '<span class="upload-placeholder">Drop or select image</span>';
        updateExtractButton();

        [baseFare, perMinuteRate, perKmRate, duration, distance, indentedFare].filter(Boolean).forEach(el => { el.value = ''; });

        expectedFareEl.textContent = '$—';
        actualFareEl.textContent = '$—';
        resultEl.textContent = '—';
        resultEl.className = '';
    }

    if (extractBtn) {
        extractBtn.addEventListener('click', extractFromScreenshots);
        extractBtn.onclick = extractFromScreenshots;
    }
    window.extractFromScreenshots = extractFromScreenshots;
    if (calculateBtn) calculateBtn.addEventListener('click', calculateAndAudit);
    if (clearBtn) clearBtn.addEventListener('click', clearAll);

    // Recalculate on input change
    [baseFare, perMinuteRate, perKmRate, duration, distance, indentedFare].filter(Boolean).forEach(el => {
        el.addEventListener('input', calculateAndAudit);
    });

    tripAuditorInitialized = true;
}

// Script is at end of body, so DOM is ready. Retry logic handles AJAX-loaded content.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTripAuditor);
} else {
    initTripAuditor();
}
