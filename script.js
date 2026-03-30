var fareWiseInitialized = false;

function initFareWise() {
    if (fareWiseInitialized) return;

    var root = document.getElementById('fare-wise-root');
    if (!root) {
        if (document.readyState !== 'complete') setTimeout(initFareWise, 100);
        return;
    }

    var imageInput1 = root.querySelector('#imageInput1');
    var imageInput2 = root.querySelector('#imageInput2');
    var preview1 = root.querySelector('#preview1');
    var preview2 = root.querySelector('#preview2');
    var label1 = root.querySelector('#label1');
    var label2 = root.querySelector('#label2');
    var calculateBtn = root.querySelector('#calculateBtn');
    var clearBtn = root.querySelector('#clearBtn');
    var baseFare = root.querySelector('#baseFare');
    var perMinuteRate = root.querySelector('#perMinuteRate');
    var perKmRateMin = root.querySelector('#perKmRateMin');
    var perKmRateMax = root.querySelector('#perKmRateMax');
    var duration = root.querySelector('#duration');
    var distance = root.querySelector('#distance');
    var indentedFare = root.querySelector('#indentedFare');
    var expectedFareEl = root.querySelector('#expectedFare');
    var actualFareEl = root.querySelector('#actualFare');
    var resultEl = root.querySelector('#result');

    if (!imageInput1 || !imageInput2 || !preview1 || !preview2) {
        if (document.readyState === 'complete') {
            console.error('FareWise: Required elements not found.');
        } else {
            setTimeout(initFareWise, 100);
        }
        return;
    }

    var imageFiles = [null, null];

    // File upload & preview (JPG and PNG only)
    var allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    var allowedExt = /\.(jpe?g|png)$/i;

    function isValidImage(file) {
        return allowedTypes.includes(file.type) || allowedExt.test(file.name);
    }

    function setupImageSlot(input, preview, index) {
        if (!input || !preview) return;
        try {
            preview.addEventListener('click', function() { if (input) input.click(); });
            input.addEventListener('change', function(e) {
                var file = e.target.files[0];
                if (file) {
                    if (!isValidImage(file)) {
                        alert('Please upload only JPG or PNG images.');
                        input.value = '';
                        return;
                    }
                    imageFiles[index] = file;
                    var reader = new FileReader();
                    reader.onload = function(ev) {
                        preview.textContent = '';
                        var img = document.createElement('img');
                        img.src = ev.target.result;
                        img.alt = 'Screenshot';
                        preview.appendChild(img);
                    };
                    reader.readAsDataURL(file);
                }
            });
        } catch (err) {
            console.error('FareWise setup error:', err);
        }
    }

    setupImageSlot(imageInput1, preview1, 0);
    setupImageSlot(imageInput2, preview2, 1);

    // Round to exact cents (no floating-point drift)
    function roundToCent(n) {
        if (typeof n !== 'number' || isNaN(n)) return n;
        return Math.round(n * 100) / 100;
    }

    // Parse dollar amounts from OCR text (only values that look like currency: $X.XX or X.XX)
    // Excludes integers like 5, 45, 4, 409 so we don't pull in time, capacity, battery, etc.
    function parseDollarAmounts(text) {
        var matches = text.match(/\$?\s*[\d,]+\.\d{2}\b/g) || [];
        return matches.map(function(m) { return parseFloat(m.replace(/[$,]/g, '')); }).filter(function(n) { return !isNaN(n); });
    }

    // Parse duration (e.g. "12 min 34 sec" or "12:34" or "12 min") to decimal minutes
    function parseDuration(text) {
        // "12 min 34 sec" or "12 min 34 secs"
        var minSec = text.match(/(\d+)\s*min(?:ute)?s?\s*(\d+)\s*sec(?:ond)?s?/i);
        if (minSec) return parseFloat(minSec[1]) + parseFloat(minSec[2]) / 60;

        // "12:34" (minutes:seconds)
        var colon = text.match(/(\d+):(\d+)/);
        if (colon) return parseFloat(colon[1]) + parseFloat(colon[2]) / 60;

        // "12.5 min" or "12 min"
        var decimal = text.match(/(\d+\.?\d*)\s*min(?:ute)?s?/i);
        if (decimal) return parseFloat(decimal[1]);

        return null;
    }

    // Parse distance in km
    function parseDistance(text) {
        var match = text.match(/(\d+\.?\d*)\s*(?:km|kilometer|kilometre)s?/i);
        return match ? parseFloat(match[1]) : null;
    }

    // Extract from Waybill: Base Fare, Per Minute rate, Min Per km rate, Max Per km rate
    function extractFromWaybill(text) {
        var amounts = parseDollarAmounts(text);
        var lower = text.toLowerCase();

        var base = null, perMin = null, minPerKm = null, maxPerKm = null;

        // Look for labels near amounts (OCR often keeps order)
        if (lower.includes('base') && lower.includes('fare')) base = amounts[0];
        if (lower.includes('per') && lower.includes('min')) perMin = amounts.find(function(_, i) { return i > 0; }) ?? amounts[1];
        if (lower.includes('per') && (lower.includes('km') || lower.includes('kilometer'))) {
            // Expect two km rates at the end: [minPerKm, maxPerKm]
            minPerKm = amounts.length >= 4 ? amounts[amounts.length - 2] : amounts[amounts.length - 1];
            maxPerKm = amounts[amounts.length - 1];
        }

        // Fallback: use positional amounts — base, perMin, minPerKm, maxPerKm
        if (amounts.length >= 4 && (!base || !perMin || !minPerKm || !maxPerKm)) {
            base = base ?? amounts[0];
            perMin = perMin ?? amounts[1];
            minPerKm = minPerKm ?? amounts[2];
            maxPerKm = maxPerKm ?? amounts[3];
        } else if (amounts.length === 3 && (!base || !perMin || !minPerKm)) {
            // Single km rate — use it for both min and max
            base = base ?? amounts[0];
            perMin = perMin ?? amounts[1];
            minPerKm = minPerKm ?? amounts[2];
            maxPerKm = maxPerKm ?? amounts[2];
        }

        return { baseFare: base, perMinuteRate: perMin, perKmRateMin: minPerKm, perKmRateMax: maxPerKm };
    }

    // Extract from Trip Details: Duration, Distance, first Indented Fare
    // First indented fare = the amount directly under the top "Fare" total (second amount in order)
    function extractFromTripDetails(text) {
        var durationVal = parseDuration(text);
        var distanceVal = parseDistance(text);
        var allAmounts = parseDollarAmounts(text);

        // Filter out the distance value — e.g. "5.54 km" has two decimal places
        // and matches the dollar pattern, which shifts the indices
        var amounts = distanceVal != null
            ? allAmounts.filter(function(a) { return a !== distanceVal; })
            : allAmounts;

        var indentedFareVal = amounts.length >= 2 ? amounts[1] : amounts[0];

        return {
            duration: durationVal,
            distance: distanceVal,
            indentedFare: indentedFareVal != null ? roundToCent(indentedFareVal) : null
        };
    }

    // Classify OCR text as waybill or trip details based on content keywords
    function classifyOcrText(text) {
        var lower = text.toLowerCase();
        var waybillScore = 0;
        var tripScore = 0;

        // Waybill indicators
        if (lower.includes('waybill')) waybillScore += 5;
        if (lower.includes('base') && lower.includes('fare')) waybillScore += 3;
        if (lower.includes('per') && lower.includes('minute')) waybillScore += 3;
        if (lower.includes('per') && lower.includes('km')) waybillScore += 3;
        if (lower.includes('passenger')) waybillScore += 2;
        if (lower.includes('license plate')) waybillScore += 2;
        if (lower.includes('trip #')) waybillScore += 1;

        // Trip Details indicators
        if (lower.includes('trip details')) tripScore += 5;
        if (lower.includes('your earnings')) tripScore += 4;
        if (lower.includes('service fee')) tripScore += 3;
        if (lower.includes('duration')) tripScore += 2;
        if (lower.includes('distance')) tripScore += 2;
        if (lower.includes('points earned')) tripScore += 2;
        if (lower.includes('surge')) tripScore += 1;

        if (waybillScore > tripScore) return 'waybill';
        if (tripScore > waybillScore) return 'tripDetails';
        return 'unknown';
    }

    // Extract from screenshots using Tesseract with auto-detection
    async function extractFromScreenshots() {
        if (typeof Tesseract === 'undefined') {
            alert('OCR library is still loading. Please wait a moment and try again.');
            return;
        }
        if (!imageFiles[0] && !imageFiles[1]) return;
        if (label1) { label1.textContent = ''; label1.className = 'detected-label'; }
        if (label2) { label2.textContent = ''; label2.className = 'detected-label'; }

        try {
            var worker = await Tesseract.createWorker();
            await worker.loadLanguage('eng');
            await worker.initialize('eng');

            // OCR all uploaded images
            var ocrResults = [];
            for (var i = 0; i < 2; i++) {
                if (imageFiles[i]) {
                    var result = await worker.recognize(imageFiles[i]);
                    ocrResults.push({ index: i, text: result.data.text, type: classifyOcrText(result.data.text) });
                }
            }
            await worker.terminate();

            // Identify which image is which
            var waybillText = null, tripText = null;
            var waybillIdx = -1, tripIdx = -1;

            for (var j = 0; j < ocrResults.length; j++) {
                var r = ocrResults[j];
                if (r.type === 'waybill' && waybillText === null) {
                    waybillText = r.text;
                    waybillIdx = r.index;
                } else if (r.type === 'tripDetails' && tripText === null) {
                    tripText = r.text;
                    tripIdx = r.index;
                }
            }

            // Handle edge cases: both classified as the same type or both unknown
            if (ocrResults.length === 2) {
                if (waybillText && !tripText) {
                    // Both scored as waybill — use the other as trip details
                    var otherW = ocrResults.find(function(r) { return r.index !== waybillIdx; });
                    if (otherW) { tripText = otherW.text; tripIdx = otherW.index; }
                } else if (tripText && !waybillText) {
                    // Both scored as trip details — use the other as waybill
                    var otherT = ocrResults.find(function(r) { return r.index !== tripIdx; });
                    if (otherT) { waybillText = otherT.text; waybillIdx = otherT.index; }
                } else if (!waybillText && !tripText) {
                    // Both unknown — assign first as waybill, second as trip
                    waybillText = ocrResults[0].text; waybillIdx = ocrResults[0].index;
                    tripText = ocrResults[1].text; tripIdx = ocrResults[1].index;
                }
            }

            // Show detection labels
            var labels = [label1, label2];
            if (waybillIdx >= 0 && labels[waybillIdx]) {
                labels[waybillIdx].textContent = 'Waybill';
                labels[waybillIdx].className = 'detected-label detected-waybill';
            }
            if (tripIdx >= 0 && tripIdx !== waybillIdx && labels[tripIdx]) {
                labels[tripIdx].textContent = 'Trip Details';
                labels[tripIdx].className = 'detected-label detected-trip';
            }

            // Extract data from identified images
            if (waybillText) {
                var w = extractFromWaybill(waybillText);
                if (w.baseFare != null) baseFare.value = w.baseFare;
                if (w.perMinuteRate != null) perMinuteRate.value = w.perMinuteRate;
                if (w.perKmRateMin != null) perKmRateMin.value = w.perKmRateMin;
                if (w.perKmRateMax != null) perKmRateMax.value = w.perKmRateMax;
            }

            if (tripText) {
                var t = extractFromTripDetails(tripText);
                if (t.duration != null) duration.value = t.duration.toFixed(2);
                if (t.distance != null) distance.value = t.distance;
                if (t.indentedFare != null) indentedFare.value = String(t.indentedFare);
            }

        } catch (err) {
            console.error(err);
            alert('Extraction failed. Please enter the values manually.');
        }
    }

    // Calculation: Expected Range = Base + (Minutes * PerMinRate) + (km * MinPerKmRate or MaxPerKmRate)
    function calculateAndAudit() {
        var base = parseFloat(baseFare.value) || 0;
        var perMin = parseFloat(perMinuteRate.value) || 0;
        var minKm = parseFloat(perKmRateMin.value) || 0;
        var maxKm = parseFloat(perKmRateMax.value) || 0;
        var mins = parseFloat(duration.value) || 0;
        var km = parseFloat(distance.value) || 0;
        var actual = parseFloat(indentedFare.value);

        var hasRates = (perMin > 0 || minKm > 0 || maxKm > 0) && (mins > 0 || km > 0);
        var hasActual = !isNaN(actual) && indentedFare.value.trim() !== '';

        if (!hasRates && base === 0) {
            expectedFareEl.textContent = '$—';
            actualFareEl.textContent = hasActual ? '$' + roundToCent(actual).toFixed(2) : '$—';
            resultEl.textContent = '—';
            resultEl.className = '';
            return;
        }

        var expectedMin = roundToCent(base + (mins * perMin) + (km * minKm));
        var expectedMax = roundToCent(base + (mins * perMin) + (km * maxKm));

        expectedFareEl.textContent = '$' + expectedMin.toFixed(2) + ' – $' + expectedMax.toFixed(2);
        actualFareEl.textContent = hasActual ? '$' + roundToCent(actual).toFixed(2) : '$—';

        if (!hasActual) {
            resultEl.textContent = '—';
            resultEl.className = '';
            return;
        }

        var actualRounded = roundToCent(actual);
        if (actualRounded < expectedMin - 0.004) {
            resultEl.textContent = 'Underpaid by $' + roundToCent(expectedMin - actualRounded).toFixed(2);
            resultEl.className = 'result-underpaid';
        } else if (actualRounded > expectedMax + 0.004) {
            resultEl.textContent = 'Overpaid by $' + roundToCent(actualRounded - expectedMax).toFixed(2);
            resultEl.className = 'result-overpaid';
        } else {
            resultEl.textContent = 'Within Range — Correct';
            resultEl.className = 'result-match';
        }
    }

    function clearAll() {
        imageFiles = [null, null];
        if (imageInput1) imageInput1.value = '';
        if (imageInput2) imageInput2.value = '';
        if (preview1) preview1.innerHTML = '<span class="upload-placeholder">Drop or select image</span>';
        if (preview2) preview2.innerHTML = '<span class="upload-placeholder">Drop or select image</span>';
        if (label1) { label1.textContent = ''; label1.className = 'detected-label'; }
        if (label2) { label2.textContent = ''; label2.className = 'detected-label'; }
        updateExtractButton();

        [baseFare, perMinuteRate, perKmRateMin, perKmRateMax, duration, distance, indentedFare].filter(Boolean).forEach(function(el) { el.value = ''; });

        expectedFareEl.textContent = '$—';
        actualFareEl.textContent = '$—';
        resultEl.textContent = '—';
        resultEl.className = '';
    }

    if (calculateBtn) {
        calculateBtn.addEventListener('click', async function() {
            if (imageFiles[0] || imageFiles[1]) {
                calculateBtn.disabled = true;
                calculateBtn.textContent = 'Extracting...';
                try {
                    await extractFromScreenshots();
                } finally {
                    calculateBtn.disabled = false;
                    calculateBtn.textContent = 'Calculate & Audit';
                }
            }
            calculateAndAudit();
        });
    }
    if (clearBtn) clearBtn.addEventListener('click', clearAll);

    // Recalculate on input change
    [baseFare, perMinuteRate, perKmRateMin, perKmRateMax, duration, distance, indentedFare].filter(Boolean).forEach(function(el) {
        el.addEventListener('input', calculateAndAudit);
    });

    fareWiseInitialized = true;
}

// Script is at end of body, so DOM is ready. Retry logic handles AJAX-loaded content.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFareWise);
} else {
    initFareWise();
}
