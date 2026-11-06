/**
 * Midnight Express LKN - Booking System
 *
 * Enhanced booking system with:
 * - Real-time booking conflict detection
 * - 24-hour timeline visualization
 * - Google Sheets integration
 * - Comprehensive validation matching Google Form
 */

(function($) {
    "use strict";

    // =================================================================
    // CONFIGURATION
    // =================================================================

    /**
     * URL to fetch busy pickup starts from calendar Apps Script (GET → [{datetime}]).
     * Points at the same deployment as NEW_SCRIPT_URL.
     */
    const BOOKINGS_API_URL = "https://script.google.com/macros/s/AKfycbyUfrtvd64b5GKnkaHONJ7YDGGAXAAWGTxYK3lBASguhUjlO_iXXHiM4-iflODhJTYP4w/exec";

    /**
     * Google Form submission URL (from the form action)
     */
    const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSelLJ8Yqj8jHXreIB3DW8MvsBUtHea8DB7UTjyaYkM3Q2RbTA/formResponse";

    /**
     * Calendar Apps Script web app (/exec): POST mirrors bookings onto Google Calendar.
     * Same deployment as BOOKINGS_API_URL (GET busy slots). No-op only if placeholder.
     */
    const NEW_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyUfrtvd64b5GKnkaHONJ7YDGGAXAAWGTxYK3lBASguhUjlO_iXXHiM4-iflODhJTYP4w/exec';

    /**
     * Towns Midnight Express does not serve (SPEC.md EXCLUDED).
     * Match whole town name as a word in the address (case-insensitive).
     */
    const EXCLUDED_TOWNS = [
        'Mooresville',
        'Cornelius',
        'Davidson',
        'Huntersville',
        'Troutman',
        'Statesville'
    ];

    function addressHasExcludedTown(address) {
        const a = String(address || '');
        for (let i = 0; i < EXCLUDED_TOWNS.length; i++) {
            const town = EXCLUDED_TOWNS[i];
            const re = new RegExp('\\b' + town.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '\\b', 'i');
            if (re.test(a)) return town;
        }
        return null;
    }



    /**
     * Booking window rules (Donald):
     * - Each ride occupies exactly 2 hours starting at pickup (pickup → pickup+120).
     * - Two windows overlap iff |P - E| < 120 minutes (strict).
     * - DRIVER_COUNT drivers can work at once; a proposed pickup is unavailable
     *   only when it would overlap DRIVER_COUNT or more existing rides (needs another driver).
     */
    const RIDE_DURATION_MINUTES = 120;
    const DRIVER_COUNT = 2;

    /**
     * Cached bookings data
     */
    let cachedBookings = [];
    let lastFetchTime = null;
    let bookingsFetchOk = false;
    const CACHE_DURATION_MS = 60000; // 1 minute

    /**
     * Track pending bookings (not yet in database)
     * This helps prevent race conditions where multiple bookings are submitted
     * before the database is updated
     */
    let pendingBookings = [];

    // =================================================================
    // BOOKING DATA MANAGEMENT
    // =================================================================

    /**
     * Fetch bookings from Google Apps Script endpoint
     * @returns {Promise<Array>} - Array of booking objects
     */
    async function fetchBookings() {
        // Return cached data if still fresh
        if (lastFetchTime && (Date.now() - lastFetchTime < CACHE_DURATION_MS)) {
            return Promise.resolve(cachedBookings);
        }

        return new Promise(function(resolve, reject) {
            $.ajax({
                url: BOOKINGS_API_URL,
                method: 'GET',
                dataType: 'json',
                cache: false,
                success: function(bookings) {
                    console.log('Fetched bookings:', bookings);
                    cachedBookings = Array.isArray(bookings) ? bookings : [];
                    lastFetchTime = Date.now();
                    bookingsFetchOk = true;
                    resolve(cachedBookings);
                },
                error: function(xhr, status, error) {
                    console.error('Error fetching bookings:', status, error);
                    console.warn('Availability fetch failed; not claiming all times available');
                    bookingsFetchOk = false;
                    resolve(cachedBookings.length > 0 ? cachedBookings : []);
                }
            });
        });
    }

    /**
     * Parse booking datetime from ISO format
     * @param {string} datetimeStr - ISO datetime string (e.g., "2025-11-01T18:00:00.000Z")
     * @returns {object} - {date: string (YYYY-MM-DD), hours: number, minutes: number}
     */
    function formatLocalYmd(date) {
        var y = date.getFullYear();
        var m = String(date.getMonth() + 1);
        var d = String(date.getDate());
        if (m.length < 2) m = '0' + m;
        if (d.length < 2) d = '0' + d;
        return y + '-' + m + '-' + d;
    }

    function parseBookingDateTime(datetimeStr) {
        const date = new Date(datetimeStr);
        return {
            // Local calendar date (not UTC) so evening ET rides stay on the right day
            date: formatLocalYmd(date),
            hours: date.getHours(),
            minutes: date.getMinutes()
        };
    }

    /**
     * Get all bookings for a specific date (including pending bookings)
     * @param {string} dateStr - Date in YYYY-MM-DD format
     * @param {boolean} includePending - Whether to include pending bookings
     * @returns {Promise<Array>} - Array of bookings for that date
     */
    async function getBookingsForDate(dateStr, includePending = false) {
        const allBookings = await fetchBookings();

        const dbBookings = allBookings
            .map(function(booking) {
                const parsed = parseBookingDateTime(booking.datetime);
                return {
                    date: parsed.date,
                    hours: parsed.hours,
                    minutes: parsed.minutes
                };
            })
            .filter(function(booking) {
                return booking.date === dateStr;
            });

        // Include pending bookings if requested
        if (includePending) {
            const pending = pendingBookings
                .filter(function(booking) {
                    return booking.date === dateStr;
                });
            return dbBookings.concat(pending);
        }

        return dbBookings;
    }

    /**
     * Ride occupation window: [pickup, pickup + RIDE_DURATION_MINUTES) in minutes since midnight.
     * @param {number} hours
     * @param {number} minutes
     * @returns {{startMinutes: number, endMinutes: number}}
     */
    function getRideWindow(hours, minutes) {
        const startMinutes = hours * 60 + minutes;
        return {
            startMinutes: startMinutes,
            endMinutes: startMinutes + RIDE_DURATION_MINUTES
        };
    }

    /**
     * Two pickups' 2-hour windows overlap when |P - E| < RIDE_DURATION_MINUTES.
     */
    function ridesOverlap(proposedMinutes, existingMinutes) {
        return Math.abs(proposedMinutes - existingMinutes) < RIDE_DURATION_MINUTES;
    }

    /**
     * How many existing rides' windows overlap a proposed pickup.
     */
    function countOverlappingRides(proposedMinutes, existingBookings) {
        var count = 0;
        for (var i = 0; i < existingBookings.length; i++) {
            var booking = existingBookings[i];
            var existingMinutes = booking.hours * 60 + booking.minutes;
            if (ridesOverlap(proposedMinutes, existingMinutes)) {
                count++;
            }
        }
        return count;
    }

    /**
     * Proposed pickup conflicts when it would need more than DRIVER_COUNT drivers
     * (overlaps DRIVER_COUNT or more existing rides).
     * @param {string} dateStr - Date in YYYY-MM-DD format (unused; bookings already filtered)
     * @param {string} timeStr - Time in HH:MM format
     * @param {Array} existingBookings - Array of bookings for the date
     * @returns {boolean} - True if there's a conflict
     */
    function hasTimeConflict(dateStr, timeStr, existingBookings) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const proposedTimeMinutes = hours * 60 + minutes;
        return countOverlappingRides(proposedTimeMinutes, existingBookings) >= DRIVER_COUNT;
    }

    // =================================================================
    // TIMELINE VISUALIZATION
    // =================================================================

    /**
     * Format time in 12-hour format
     * @param {number} totalMinutes - Minutes since midnight
     * @returns {string} - Formatted time
     */
    function formatTimeFromMinutes(totalMinutes) {
        var hours = Math.floor(totalMinutes / 60);
        var minutes = totalMinutes % 60;
        var ampm = hours >= 12 ? 'PM' : 'AM';
        var displayHour = hours % 12 || 12;
        var displayMinutes = minutes < 10 ? '0' + minutes : minutes;
        return displayHour + ':' + displayMinutes + ' ' + ampm;
    }

    /**
     * Build 24-hour continuous timeline visualization showing exact blocked periods
     * @param {Array} bookings - Array of bookings for the selected date
     * @returns {string} - HTML for timeline
     */
    /**
     * Build 24-hour timeline of pickup times a customer cannot choose.
     * Red ranges use the same check as hasTimeConflict / countOverlappingRides:
     * a minute P is unavailable when [P, P+RIDE_DURATION) would overlap
     * DRIVER_COUNT or more existing rides.
     * @param {Array} bookings - Array of bookings for the selected date
     * @returns {string} - HTML for timeline
     */
    function buildTimeline(bookings) {
        // Scan every minute with the same overlap rule as validation, then merge.
        const blockedMinutes = [];
        for (var m = 0; m < 1440; m++) {
            if (countOverlappingRides(m, bookings) >= DRIVER_COUNT) {
                blockedMinutes.push(m);
            }
        }

        const unavailableRanges = [];
        var rangeStart = null;
        var prev = null;
        for (var i = 0; i < blockedMinutes.length; i++) {
            var minute = blockedMinutes[i];
            if (rangeStart === null) {
                rangeStart = minute;
                prev = minute;
            } else if (minute === prev + 1) {
                prev = minute;
            } else {
                // half-open [rangeStart, prev+1)
                unavailableRanges.push({ start: rangeStart, end: prev + 1 });
                rangeStart = minute;
                prev = minute;
            }
        }
        if (rangeStart !== null) {
            unavailableRanges.push({ start: rangeStart, end: prev + 1 });
        }

        // Build continuous timeline bar
        let html = '<div style="position: relative; margin: 20px 0;">';

        // Time labels at start and end
        html += '<div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 11px; color: #666;">';
        html += '<span>12:00 AM</span>';
        html += '<span>12:00 PM</span>';
        html += '<span>11:59 PM</span>';
        html += '</div>';

        // Main timeline bar (full 24 hours = 1440 minutes) — no text inside red blocks
        html += '<div style="position: relative; height: 40px; background: #27AE60; border-radius: 4px; overflow: visible;">';

        unavailableRanges.forEach(function(range) {
            var startPercent = (range.start / 1440) * 100;
            var widthPercent = ((range.end - range.start) / 1440) * 100;
            html += '<div style="position: absolute; left: ' + startPercent + '%; width: ' + widthPercent + '%; height: 100%; background: #d9534f; border-radius: 2px;"></div>';
        });

        html += '</div>';

        // Readable labels under the bar (phone-friendly; avoids cramped text inside red)
        if (unavailableRanges.length > 0) {
            html += '<div style="margin-top: 8px; font-size: 12px; color: #a94442; text-align: center; line-height: 1.4;">';
            unavailableRanges.forEach(function(range, idx) {
                var label = 'Unavailable: ' + formatTimeFromMinutes(range.start) + ' - ' + formatTimeFromMinutes(range.end);
                if (idx > 0) html += '<br>';
                html += '<span>' + label + '</span>';
            });
            html += '</div>';
        }

        html += '</div>';

        // Legend
        html += '<div style="display: flex; gap: 20px; margin-top: 10px; font-size: 12px; justify-content: center;">';
        html += '<div><span style="display: inline-block; width: 15px; height: 15px; background: #27AE60; border-radius: 2px; vertical-align: middle; margin-right: 5px;"></span>Available</div>';
        html += '<div><span style="display: inline-block; width: 15px; height: 15px; background: #d9534f; border-radius: 2px; vertical-align: middle; margin-right: 5px;"></span>Unavailable</div>';
        html += '</div>';

        return html;
    }

    function formatDisplayDate(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }

    /**
     * Update timeline when date changes (uses cached bookings data)
     * @param {string} dateStr - Date in YYYY-MM-DD format
     * @param {function} callback - Optional callback to receive bookings data
     */
    function updateTimeline(dateStr, callback) {
        if (!dateStr) {
            $('#timeline-container').slideUp();
            if (callback) callback([]);
            return;
        }

        // Update date display and show container immediately
        $('#timeline-date').text(formatDisplayDate(dateStr));
        $('#timeline-container').slideDown();

        // Filter cached bookings for this date (no network call)
        const bookings = cachedBookings
            .map(function(booking) {
                const parsed = parseBookingDateTime(booking.datetime);
                return {
                    date: parsed.date,
                    hours: parsed.hours,
                    minutes: parsed.minutes
                };
            })
            .filter(function(booking) {
                return booking.date === dateStr;
            });

        if (!bookingsFetchOk) {
            $('#timeline-instruction').hide();
            $('#timeline-visual').html('<p style="text-align: center; color: #666;">Call (980) 422-9125 to confirm availability</p>');
        } else if (bookings.length === 0) {
            $('#timeline-instruction').hide();
            $('#timeline-visual').html('<p style="text-align: center; color: #27AE60; font-weight: bold;">All times available!</p>');
        } else {
            $('#timeline-instruction').show();
            $('#timeline-visual').html(buildTimeline(bookings));
        }

        // Pass bookings to callback for caching
        if (callback) callback(bookings);
    }

    /**
     * Update return flight timeline when date changes (uses cached bookings data)
     * @param {string} dateStr - Date in YYYY-MM-DD format
     * @param {function} callback - Optional callback to receive bookings data
     */
    function updateReturnTimeline(dateStr, callback) {
        if (!dateStr) {
            $('#return-timeline-container').slideUp();
            if (callback) callback([]);
            return;
        }

        // Update date display and show container immediately
        $('#return-timeline-date').text(formatDisplayDate(dateStr));
        $('#return-timeline-container').slideDown();

        // Filter cached bookings for this date (no network call)
        const bookings = cachedBookings
            .map(function(booking) {
                const parsed = parseBookingDateTime(booking.datetime);
                return {
                    date: parsed.date,
                    hours: parsed.hours,
                    minutes: parsed.minutes
                };
            })
            .filter(function(booking) {
                return booking.date === dateStr;
            });

        if (!bookingsFetchOk) {
            $('#return-timeline-instruction').hide();
            $('#return-timeline-visual').html('<p style="text-align: center; color: #666;">Call (980) 422-9125 to confirm availability</p>');
        } else if (bookings.length === 0) {
            $('#return-timeline-instruction').hide();
            $('#return-timeline-visual').html('<p style="text-align: center; color: #27AE60; font-weight: bold;">All times available!</p>');
        } else {
            $('#return-timeline-instruction').show();
            $('#return-timeline-visual').html(buildTimeline(bookings));
        }

        // Pass bookings to callback for caching
        if (callback) callback(bookings);
    }

    // =================================================================
    // VALIDATION
    // =================================================================

    /**
     * Validate phone number (must be 10 digits)
     * @param {string} phone - Phone number
     * @returns {boolean}
     */
    function validatePhone(phone) {
        const digitsOnly = phone.replace(/\D/g, '');
        return digitsOnly.length === 10;
    }

    /**
     * Validate email format
     * @param {string} email - Email address
     * @returns {boolean}
     */
    function validateEmail(email) {
        const pattern = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
        return pattern.test(email);
    }

    /**
     * Validate flight number format
     * @param {string} flightNumber - Flight number
     * @returns {boolean}
     */
    function validateFlightNumber(flightNumber) {
        const pattern = /^[a-zA-Z0-9]{2,3}[\s-]?\d{1,4}[a-zA-Z]?$/;
        return pattern.test(flightNumber);
    }

    /**
     * Synchronous validation using pre-loaded bookings
     * @param {string} dateStr - Date in YYYY-MM-DD format
     * @param {string} timeStr - Time in HH:MM format
     * @param {Array} bookings - Pre-loaded bookings for this date
     * @returns {object} - {valid: boolean, error: string}
     */
    function validateDateTimeSync(dateStr, timeStr, bookings) {
        if (!dateStr || !timeStr) {
            return {
                valid: false,
                error: 'Please select both date and time'
            };
        }

        // Check if in the past
        const selectedDateTime = new Date(dateStr + 'T' + timeStr);
        const now = new Date();

        if (selectedDateTime < now) {
            return {
                valid: false,
                error: 'Pickup time cannot be in the past'
            };
        }

        // Check minimum advance (3 hours)
        const minDateTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
        if (selectedDateTime < minDateTime) {
            return {
                valid: false,
                error: 'Please book at least 3 hours in advance. For urgent bookings, call (980) 422-9125'
            };
        }

        // Check booking conflicts
        if (hasTimeConflict(dateStr, timeStr, bookings)) {
            return {
                valid: false,
                error: 'This time slot is not available (conflicts with existing booking). Please choose a different time.'
            };
        }

        return {
            valid: true,
            error: ''
        };
    }

    /**
     * Validate date/time against bookings (async version for form submission)
     * Includes pending bookings to prevent race conditions
     * @param {string} dateStr - Date in YYYY-MM-DD format
     * @param {string} timeStr - Time in HH:MM format
     * @returns {Promise<object>} - {valid: boolean, error: string}
     */
    async function validateDateTime(dateStr, timeStr) {
        // Include pending bookings in validation to catch conflicts
        // before they reach the database
        const bookings = await getBookingsForDate(dateStr, true);
        return validateDateTimeSync(dateStr, timeStr, bookings);
    }



    function isNewScriptReady() {
        return typeof NEW_SCRIPT_URL === 'string' &&
            NEW_SCRIPT_URL.indexOf('http') === 0 &&
            NEW_SCRIPT_URL.indexOf('PASTE_EXEC_URL_HERE') === -1;
    }

    /**
     * Best-effort mirror to the new calendar Apps Script after the Google Form succeeds.
     * no-cors + fire-and-forget so a calendar failure never blocks the customer request.
     * Best-effort calendar mirror after Google Form success (no-cors).
     */
    function postBookingToCalendar(formData) {
        if (!isNewScriptReady()) {
            return Promise.resolve({ skipped: true });
        }
        var payload = {
            name: formData.name,
            phone: formData.phone,
            email: formData.email || '',
            pickupDate: formData.pickupDate,
            pickupTime: formData.pickupTime,
            pickupAddress: formData.pickupAddress,
            destinationAddress: formData.destinationAddress,
            passengers: formData.passengers,
            specialNotes: formData.specialNotes || '',
            airportTrip: formData.airportTrip,
            flightNumber: formData.flightNumber || '',
            checkingBags: formData.checkingBags || 'No',
            roundTrip: formData.roundTrip || 'No',
            returnDate: formData.returnDate || '',
            returnTime: formData.returnTime || ''
        };
        return fetch(NEW_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            credentials: 'omit',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        }).then(function() {
            return { delivered: 'opaque' };
        }).catch(function(err) {
            console.warn('Calendar mirror failed (request still sent to owner):', err);
            return { skipped: true, error: String(err && err.message ? err.message : err) };
        });
    }


    function updateQuoteDisplay() {
        var $details = $('#quote-details');
        if (!$details.length) return;
        var html = 'Enter your pickup address and airport to see your price.';
        $details.html(html);
    }

    // =================================================================
    // CONDITIONAL FIELD LOGIC
    // =================================================================

    /**
     * Update conditional fields based on airport trip and round trip selections
     * Follows existing show/hide patterns from booking.js
     */
    function updateConditionalFields() {
        const airportTrip = $('input[name="airport-trip"]:checked').val();
        const roundTrip = $('#booking-round-trip').is(':checked');

        // Show/hide checking bags and round trip sections
        if (airportTrip === 'Yes') {
            $('#checking-bags-section').slideDown();
            $('#round-trip-section').slideDown();
        } else {
            $('#checking-bags-section').slideUp();
            $('#round-trip-section').slideUp();
            $('#booking-checking-bags').prop('checked', false);
            $('#booking-round-trip').prop('checked', false);
        }

        // Show/hide return flight section and timeline
        if (airportTrip === 'Yes' && roundTrip) {
            $('#return-flight-section').slideDown();
            $('#return-timeline-container').slideDown();
        } else {
            $('#return-flight-section').slideUp();
            $('#return-timeline-container').slideUp();
            $('#booking-return-date').val('');
            $('#booking-return-time').val('');
            $('#booking-flight').val('');
            $('#return-date-error').text('').hide();
            $('#return-time-error').text('').hide();
        }
    }

    /**
     * Return Flight Validation
     * Validates that return datetime is after pickup datetime
     */
    function validateReturnFlight(pickupDateTime, returnDateTime) {
        if (!pickupDateTime || !returnDateTime) return true;

        const pickup = new Date(pickupDateTime);
        const returnDate = new Date(returnDateTime);

        if (returnDate <= pickup) {
            $('#return-date-error').text('Return date must be after pickup date').show();
            $('#booking-return-date').closest('.form-group').addClass('has-error');
            return false;
        }

        $('#return-date-error').text('').hide();
        $('#return-date-error').text('').hide();
        $('#booking-return-date').closest('.form-group').removeClass('has-error');
        $('#booking-return-time').closest('.form-group').removeClass('has-error');
        return true;
    }

    /**
     * Dynamic Passenger Capacity Calculation
     * Calculate max passengers based on special requirements
     *
     * Owner rules (Donald):
     * - Base online max 5 with carry-on only
     * - Checked bags = -1 seat (max 4 with bags)
     * - Wheelchair and/or car seat = -1 seat total (same as live: they share one seat)
     * - Over the resulting max: do not book online; call (980) 422-9125
     */
    function calculatePassengerCapacity(requirements) {
        let maxCapacity = 5; // Carry-on online max; more than this must call

        // Wheelchair and/or car seat share one seat reduction (live behavior)
        const hasMobilityAids = requirements.wheelchair || requirements.carseat;
        if (hasMobilityAids) {
            maxCapacity -= 1;
        }

        // Checked bags take a full seat → max 4 with bags (before mobility)
        if (requirements.checkingBags) {
            maxCapacity -= 1;
        }

        return Math.max(maxCapacity, 1); // Minimum 1 passenger
    }

    /**
     * Update passenger capacity display and validation
     */
    function updatePassengerCapacity() {
        const wheelchair = $('#booking-wheelchair').is(':checked');
        const carseat = $('#booking-carseat').is(':checked');
        const checkingBags = $('#booking-checking-bags').is(':checked');

        const requirements = {
            wheelchair: wheelchair,
            carseat: carseat,
            checkingBags: checkingBags
        };

        const maxCapacity = calculatePassengerCapacity(requirements);
        const callMsg = 'For more than ' + maxCapacity + ' passengers, please call (980) 422-9125.';

        // Update or create capacity message
        let $capacityMsg = $('#passenger-capacity-message');
        if ($capacityMsg.length === 0) {
            $('#booking-passengers').closest('.form-group').append(
                '<small id="passenger-capacity-message" class="help-block" style="color: #666; font-size: 12px; margin-top: 5px;"></small>'
            );
            $capacityMsg = $('#passenger-capacity-message');
        }

        // Update capacity message with detailed explanation
        if (wheelchair || carseat || checkingBags) {
            let reductionReasons = [];
            if (wheelchair || carseat) {
                reductionReasons.push('mobility aid');
            }
            if (checkingBags) {
                reductionReasons.push('checked bags');
            }

            const reasonsText = reductionReasons.join(', ');
            $capacityMsg.text('Maximum passengers: ' + maxCapacity + ' (reduced for ' + reasonsText + ')').show();
        } else {
            $capacityMsg.text('');
        }

        // Allow typing above the online max so we can show the call-us message
        // (effective limit is still maxCapacity via validation / submit block).
        $('#booking-passengers').attr('max', 20);

        // Validate current passenger count — do not clamp (clamping re-fires input and
        // would wipe the call message). Over limit: show call-us, block online book.
        const currentPassengers = parseInt($('#booking-passengers').val()) || 1;
        if (currentPassengers > maxCapacity) {
            $capacityMsg.text(callMsg).show();
            $capacityMsg.css('color', '#d9534f');
            $('#booking-passengers').closest('.form-group').addClass('has-error');
        } else {
            $capacityMsg.css('color', '#666');
            $('#booking-passengers').closest('.form-group').removeClass('has-error');
        }
    }

    /**
     * Handle Dual Submission for Round-Trip Bookings
     * Creates two separate Google Sheets entries for round-trip bookings
     */
    async function handleDualSubmission(bookingData) {
        console.log('=== HANDLE DUAL SUBMISSION ===');
        console.log('Round Trip?', bookingData.roundTrip);
        console.log('Airport Trip?', bookingData.airportTrip);
        console.log('Pickup Date:', bookingData.pickupDate);
        console.log('Return Date:', bookingData.returnDate);
        console.log('Flight Number:', bookingData.flightNumber);

        const submissions = [];

        // Create outbound submission
        const outboundSubmission = {
            name: bookingData.name,
            phone: bookingData.phone,
            email: bookingData.email,
            pickupDate: bookingData.pickupDate,
            pickupTime: bookingData.pickupTime,
            pickupAddress: bookingData.pickupAddress,
            destinationAddress: bookingData.destinationAddress,
            passengers: bookingData.passengers,
            specialNotes: bookingData.specialNotes,
            airportTrip: bookingData.airportTrip,
            flightNumber: '', // No flight number for outbound (dropping off at airport)
            checkingBags: bookingData.checkingBags,
            specialRequirements: bookingData.specialRequirements,
            otherRequirementText: bookingData.otherRequirementText
        };
        submissions.push(outboundSubmission);
        console.log('Created outbound submission');

        // Create return submission if round trip
        if (bookingData.roundTrip === 'Yes') {
            console.log('Creating return submission...');
            const returnSubmission = {
                name: bookingData.name,
                phone: bookingData.phone,
                email: bookingData.email,
                pickupDate: bookingData.returnDate,
                pickupTime: bookingData.returnTime,
                pickupAddress: bookingData.destinationAddress, // Swapped
                destinationAddress: bookingData.pickupAddress, // Swapped
                passengers: bookingData.passengers,
                specialNotes: bookingData.specialNotes,
                airportTrip: 'Yes', // Always "Yes" for return trips
                flightNumber: bookingData.flightNumber, // Return flight number
                checkingBags: bookingData.checkingBags,
                specialRequirements: bookingData.specialRequirements,
                otherRequirementText: bookingData.otherRequirementText
            };
            submissions.push(returnSubmission);
            console.log('Created return submission');
        } else {
            console.log('Not a round trip, skipping return submission');
        }

        // Submit to Google Sheets
        console.log('=== SUBMITTING ' + submissions.length + ' BOOKING(S) ===');
        submissions.forEach((sub, idx) => {
            console.log('Submission ' + (idx + 1) + ':', {
                date: sub.pickupDate,
                time: sub.pickupTime,
                pickup: sub.pickupAddress,
                dest: sub.destinationAddress,
                flight: sub.flightNumber || 'N/A'
            });
        });

        const submissionPromises = submissions.map(submission => submitToGoogleSheets(submission));
        const results = await Promise.allSettled(submissionPromises);
        console.log('Submission results:', results);
        const failures = results.filter(function(r) { return r.status === 'rejected'; });
        if (failures.length > 0) {
            const reason = (failures[0].reason && failures[0].reason.message) ? failures[0].reason.message : 'Submission failed';
            throw new Error(reason);
        }
        results.forEach(function(result, idx) {
            console.log('Submission ' + (idx + 1) + ' finished:', result.value);
        });
        return submissions;
    }

    /**
     * Convert date from YYYY-MM-DD to MM/DD/YYYY format
     */
    function formatDateForGoogleForms(dateStr) {
        if (!dateStr) return '';
        var parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        return parts[1] + '/' + parts[2] + '/' + parts[0]; // MM/DD/YYYY
    }

    /**
     * Submit booking data to Google Sheets
     * @param {Object} submissionData - Booking data to submit
     * @returns {Promise} - Submission promise
     */
    function buildGoogleFormData(submissionData) {
        var googleFormData = new FormData();
        var formattedPickupDate = formatDateForGoogleForms(submissionData.pickupDate);
        var pickupDateTime = formattedPickupDate + ' ' + submissionData.pickupTime;
        googleFormData.append('entry.131833412', submissionData.name);
        googleFormData.append('entry.776900145', submissionData.phone);
        googleFormData.append('entry.121804187', submissionData.email || '');
        googleFormData.append('entry.1592582104', pickupDateTime);
        googleFormData.append('entry.1137073125', submissionData.pickupAddress);
        googleFormData.append('entry.1747359283', submissionData.destinationAddress);
        googleFormData.append('entry.240227114', submissionData.passengers);
        googleFormData.append('entry.1761921696', submissionData.specialNotes || '');
        googleFormData.append('entry.1268043435', submissionData.airportTrip);
        googleFormData.append('entry.1389653467', submissionData.flightNumber || '');
        googleFormData.append('entry.2044186606', submissionData.checkingBags || 'No');
        if (submissionData.specialRequirements && submissionData.specialRequirements.length > 0) {
            submissionData.specialRequirements.forEach(function(req) {
                googleFormData.append('entry.1055055925', req);
            });
        }
        if (submissionData.otherRequirementText) {
            googleFormData.append('entry.1055055925.other_option_response', submissionData.otherRequirementText);
        }
        return googleFormData;
    }

    /**
     * Submit to Google Forms (cross-origin).
     * Can detect: network failure, abort, timeout → error UI + call message.
     * Cannot read Google acceptance: opaque no-cors response → "Request received. We'll call to confirm".
     * Never claim booked/confirmed.
     */
    function submitToGoogleSheets(submissionData) {
        return new Promise(function(resolve, reject) {
            var googleFormData = buildGoogleFormData(submissionData);
            var controller = new AbortController();
            var timedOut = false;
            var timer = setTimeout(function() {
                timedOut = true;
                controller.abort();
            }, 20000);
            fetch(GOOGLE_FORM_URL, {
                method: 'POST',
                body: googleFormData,
                mode: 'no-cors',
                credentials: 'omit',
                redirect: 'follow',
                signal: controller.signal
            }).then(function(response) {
                clearTimeout(timer);
                if (response && (response.type === 'opaque' || response.ok || response.status === 0 || response.type === 'opaqueredirect')) {
                    resolve({ delivered: 'opaque' });
                    return;
                }
                if (response && response.status >= 200 && response.status < 400) {
                    resolve({ delivered: 'ok', status: response.status });
                    return;
                }
                reject(new Error('Submission failed (HTTP ' + (response && response.status) + ')'));
            }).catch(function(err) {
                clearTimeout(timer);
                if (timedOut) { reject(new Error('Submission timed out')); return; }
                if (err && err.name === 'AbortError') { reject(new Error('Submission was cancelled')); return; }
                reject(err || new Error('Network error submitting booking'));
            });
        });
    }

    /**
     * Find the first available booking time slot
     * @param {Date} currentTime - Current time
     * @returns {Date} - First available booking time
     */
    async function findFirstAvailableTime(currentTime) {
        const today = new Date(currentTime);
        today.setHours(0, 0, 0, 0);

        // Check if we need to look at tomorrow (past 8 PM or after 6 PM for bookings)
        const currentHour = currentTime.getHours();
        let searchDate = today;

        // If it's past 8 PM, start looking at tomorrow
        if (currentHour >= 20) {
            searchDate = new Date(today);
            searchDate.setDate(searchDate.getDate() + 1);
        }

        // Get bookings for the search date
        const bookings = await getBookingsForDate(formatLocalYmd(searchDate));

        // Find the first available time slot
        let searchTime = new Date(searchDate);

        // Start at 8 AM (8:00 AM) for current day, or 8 AM for future days
        if (searchDate.toDateString() === today.toDateString()) {
            // If it's current day, start from current time + buffer
            searchTime = new Date(currentTime.getTime() + (3 * 60 * 60 * 1000)); // 3 hour buffer

            // Round up to next 5-minute interval
            const minutes = searchTime.getMinutes();
            const roundedMinutes = Math.ceil(minutes / 5) * 5;
            searchTime.setMinutes(roundedMinutes);
            searchTime.setSeconds(0);

            // If the calculated time is past 8 PM, move to tomorrow
            if (searchTime.getHours() >= 20) {
                searchTime = new Date(searchDate);
                searchTime.setDate(searchTime.getDate() + 1);
                searchTime.setHours(8, 0, 0, 0);
            }
        } else {
            // For future days, start at 8 AM
            searchTime.setHours(8, 0, 0, 0);
        }

        // Check if the calculated time is too soon (less than 3 hours from now)
        const minAllowedTime = new Date(currentTime.getTime() + (3 * 60 * 60 * 1000));
        if (searchTime < minAllowedTime && searchDate.toDateString() === today.toDateString()) {
            // Time is too soon, show call message and set to next available slot
            showCallForBookingMessage();

            // Find the next available slot (at least 3 hours from now)
            searchTime = new Date(minAllowedTime);
            const minutes = searchTime.getMinutes();
            const roundedMinutes = Math.ceil(minutes / 5) * 5;
            searchTime.setMinutes(roundedMinutes);
            searchTime.setSeconds(0);

            // If this goes past 8 PM, move to tomorrow 8 AM
            if (searchTime.getHours() >= 20) {
                searchTime = new Date(today);
                searchTime.setDate(searchTime.getDate() + 1);
                searchTime.setHours(8, 0, 0, 0);
            }
        }

        return searchTime;
    }

    
    /**
     * Calculate simple default booking time (synchronous version)
     * @param {Date} currentTime - Current time
     * @returns {Date} - Default booking time
     */
    function calculateSimpleDefaultTime(currentTime) {
        const today = new Date(currentTime);
        const currentHour = currentTime.getHours();

        let defaultTime = new Date(today);

        // If it's past 8 PM, default to tomorrow 8 AM
        if (currentHour >= 20) {
            defaultTime.setDate(defaultTime.getDate() + 1);
            defaultTime.setHours(8, 0, 0, 0);
        } else {
            // Default to current time + 3 hours minimum
            defaultTime = new Date(currentTime.getTime() + (3 * 60 * 60 * 1000));

            // Round up to next 5-minute interval
            const minutes = defaultTime.getMinutes();
            const roundedMinutes = Math.ceil(minutes / 5) * 5;
            defaultTime.setMinutes(roundedMinutes);
            defaultTime.setSeconds(0);

            // If this goes past 8 PM, move to tomorrow 8 AM
            if (defaultTime.getHours() >= 20) {
                defaultTime = new Date(today);
                defaultTime.setDate(defaultTime.getDate() + 1);
                defaultTime.setHours(8, 0, 0, 0);
            }
        }

        // Ensure minimum 3-hour buffer (no banner - just set valid default)
        const minAllowedTime = new Date(currentTime.getTime() + (3 * 60 * 60 * 1000));
        if (defaultTime < minAllowedTime) {
            defaultTime = new Date(minAllowedTime);
            const minutes = defaultTime.getMinutes();
            const roundedMinutes = Math.ceil(minutes / 5) * 5;
            defaultTime.setMinutes(roundedMinutes);
            defaultTime.setSeconds(0);

            // If this goes past 8 PM, move to tomorrow 8 AM
            if (defaultTime.getHours() >= 20) {
                defaultTime = new Date(today);
                defaultTime.setDate(defaultTime.getDate() + 1);
                defaultTime.setHours(8, 0, 0, 0);
            }
        }

        return defaultTime;
    }

    // =================================================================
    // FORM INITIALIZATION
    // =================================================================

    $(function() {
        const $form = $('#bookingForm');
        if ($form.length === 0) {
            return; // Form not on this page
        }

        // Initialize with simple default time calculation first
        const now = new Date();
        const defaultDateTime = calculateSimpleDefaultTime(now);

        // Initialize Pickup Date Picker
        $('#booking-date').flatpickr({
            dateFormat: "Y-m-d",  // Store in YYYY-MM-DD format
            altInput: true,
            altFormat: "m/d/Y",  // Display as MM/DD/YYYY
            minDate: "today",
            disableMobile: "never",
            position: 'below',
            defaultDate: defaultDateTime,
            onChange: function(selectedDates, dateStr, instance) {
                if (selectedDates.length > 0) {
                    const date = selectedDates[0];
                    const dateForInput = formatLocalYmd(date);

                    // Update timeline when date changes
                    updateTimeline(dateForInput);
                }
            }
        });

        // Initialize Pickup Time Picker
        $('#booking-time').flatpickr({
            enableTime: true,
            noCalendar: true,
            dateFormat: "H:i:S",  // Store as HH:MM:SS
            altInput: true,
            altFormat: "h:i K",  // Display as 12-hour with AM/PM
            time_24hr: false,
            minuteIncrement: 5,
            disableMobile: "never",
            position: 'below',
            defaultDate: defaultDateTime
        });

        // Initialize Return Flight Flatpickr (only when round trip is selected)
        let returnDateInstance = null;
        let returnTimeInstance = null;

        function initializeReturnFlatpickr() {
            // Destroy existing instances if present
            if (returnDateInstance) {
                returnDateInstance.destroy();
            }
            if (returnTimeInstance) {
                returnTimeInstance.destroy();
            }

            // Initialize Return Flight Date Picker
            returnDateInstance = $('#booking-return-date').flatpickr({
                dateFormat: "Y-m-d",
                altInput: true,
                altFormat: "m/d/Y",
                minDate: "today",
                disableMobile: "never",
                position: 'below',
                onChange: function(selectedDates, dateStr, instance) {
                    if (selectedDates.length > 0) {
                        const date = selectedDates[0];
                        const dateForInput = formatLocalYmd(date);

                        // Update return timeline when date changes
                        updateReturnTimeline(dateForInput);

                        // Validate return date is after pickup date
                        const pickupDate = $('#booking-date').val();
                        const pickupTime = $('#booking-time').val();
                        const returnTime = $('#booking-return-time').val();
                        if (pickupDate && pickupTime && returnTime) {
                            const pickupDateTime = pickupDate + ' ' + pickupTime;
                            const returnDateTime = dateForInput + ' ' + returnTime;
                            validateReturnFlight(pickupDateTime, returnDateTime);
                        }
                    }
                }
            });

            // Initialize Return Flight Time Picker
            returnTimeInstance = $('#booking-return-time').flatpickr({
                enableTime: true,
                noCalendar: true,
                dateFormat: "H:i:S",
                altInput: true,
                altFormat: "h:i K",
                time_24hr: false,
                minuteIncrement: 5,
                disableMobile: "never",
                position: 'below',
                onChange: function(selectedDates, dateStr, instance) {
                    // Validate when time changes
                    const pickupDate = $('#booking-date').val();
                    const pickupTime = $('#booking-time').val();
                    const returnDate = $('#booking-return-date').val();
                    if (pickupDate && pickupTime && returnDate && dateStr) {
                        const pickupDateTime = pickupDate + ' ' + pickupTime;
                        const returnDateTime = returnDate + ' ' + dateStr;
                        validateReturnFlight(pickupDateTime, returnDateTime);
                    }
                }
            });
        }

        // Initialize return Flatpickr when round trip is checked
        $('#booking-round-trip').on('change', function() {
            if ($(this).is(':checked')) {
                setTimeout(function() {
                    initializeReturnFlatpickr();
                }, 100); // Small delay to ensure the field is visible
            }
        });

        // Show/hide conditional fields based on airport trip selection
        $('input[name="airport-trip"]').on('change', function() {
            updateConditionalFields();

            // Initialize flight formatter if airport trip is "Yes"
            if ($(this).val() === 'Yes') {
                setTimeout(function() {
                    $('#booking-flight').off('input.flight').on('input.flight', function() {
                        let value = $(this).val().toUpperCase().replace(/[^A-Z0-9]/g, '');

                        // Limit to reasonable flight number length (max 2-3 letters + 4 digits = 6-7 characters)
                        if (value.length > 7) {
                            value = value.substring(0, 7);
                        }

                        // Format as "AB 1234" (letters + space + numbers)
                        let formattedValue = '';
                        if (value.length > 0) {
                            // Find the split point between letters and numbers
                            let letterPart = '';
                            let numberPart = '';

                            for (let i = 0; i < value.length; i++) {
                                if (/[A-Z]/.test(value[i]) && numberPart === '') {
                                    letterPart += value[i];
                                } else {
                                    numberPart += value[i];
                                }
                            }

                            // Format: if we have both letters and numbers, add space between them
                            if (letterPart && numberPart) {
                                formattedValue = letterPart + ' ' + numberPart;
                            } else {
                                formattedValue = value; // Either only letters or only numbers
                            }
                        }

                        $(this).val(formattedValue);

                        // Clear error if flight number becomes valid
                        if (validateFlightNumber(formattedValue)) {
                            $(this).closest('.form-group').find('.help-block').text('').hide();
                        }
                    });
                }, 100); // Small delay to ensure the field is visible
            }
        });

        // Show/hide other requirement text field based on checkbox
        $('#booking-other-requirement').on('change', function() {
            if ($(this).is(':checked')) {
                $('#other-requirement-section').slideDown();
                $('#booking-other-text').attr('required', true);
            } else {
                $('#other-requirement-section').slideUp();
                $('#booking-other-text').val('').removeAttr('required');
            }
        });

        // Show/hide conditional fields based on round trip selection
        $('#booking-round-trip').on('change', function() {
            updateConditionalFields();
        });

        // Update passenger capacity when special requirements change
        $('#booking-wheelchair, #booking-carseat, #booking-checking-bags').on('change', function() {
            updatePassengerCapacity();
        });

        // Update passenger capacity on passenger input change
        $('#booking-passengers').on('input', function() {
            updatePassengerCapacity();
        });

        // Clear date/time errors when fields change
        $('#booking-date').on('change', function() {
            $('#date-error').text('').hide();
        });
        $('#booking-time').on('change', function() {
            $('#time-error').text('').hide();
        });

        // Store current date's bookings for instant validation
        let currentDateBookings = [];

        // Note: Time validation is now handled by Flatpickr onClose function
        // and form submission validation

        // Clear name error on input
        $('#booking-name').on('input', function() {
            if ($(this).val().trim()) {
                $(this).closest('.form-group').find('.help-block').text('').hide();
            }
        });

        // Auto-format phone as user types and validate
        $('#booking-phone').on('input', function() {
            let value = $(this).val().replace(/\D/g, '');
            if (value.length > 10) {
                value = value.substring(0, 10);
            }

            // Format as (123) 456-7890
            let formattedValue = '';
            if (value.length > 0) {
                if (value.length <= 3) {
                    formattedValue = '(' + value;
                } else if (value.length <= 6) {
                    formattedValue = '(' + value.substring(0, 3) + ') ' + value.substring(3);
                } else {
                    formattedValue = '(' + value.substring(0, 3) + ') ' + value.substring(3, 6) + '-' + value.substring(6);
                }
            }

            // Store the raw digits for validation and form submission
            $(this).data('raw-value', value);
            $(this).val(formattedValue);

            // Clear error if phone becomes valid
            if (validatePhone(value)) {
                $(this).closest('.form-group').find('.help-block').text('').hide();
            }
        });

        // Clear email error on valid input
        $('#booking-email').on('input', function() {
            const email = $(this).val().trim();
            if (!email || validateEmail(email)) {
                $(this).closest('.form-group').find('.help-block').text('').hide();
            }
        });

        // Clear airport trip error when selection is made
        $('input[name="airport-trip"]').on('change', function() {
            $(this).closest('.form-group').find('.help-block').text('').hide();
        });

        // Clear address errors when user starts typing
        $('#booking-pickup').on('input', function() {
            if ($(this).val().trim()) {
                $('#pickup-error').text('').hide();
                $(this).closest('.form-group').removeClass('has-error');
            }
        });

        $('#booking-destination').on('input', function() {
            if ($(this).val().trim()) {
                $('#destination-error').text('').hide();
                $(this).closest('.form-group').removeClass('has-error');
            }
        });

        // Clear "Other" requirement error when user types
        $('#booking-other-text').on('input', function() {
            if ($(this).val().trim()) {
                $(this).closest('.form-group').removeClass('has-error');
            }
        });

        // Clear error message when user starts typing again (like contact form)
        $('#booking-name, #booking-phone, #booking-email, #booking-pickup, #booking-destination, #booking-passengers, #booking-notes, #booking-flight, #booking-date, #booking-time, #booking-return-date, #booking-return-time, #booking-other-text').on('focus', function() {
            if ($('#booking-success .alert-danger').length > 0) {
                $('#booking-success').html('');
            }
        });

        // Form submission
        $form.on('submit', async function(e) {
            e.preventDefault();

            // Clear previous errors
            $('.help-block.text-danger').text('').hide();
            $('.has-error').removeClass('has-error');
            $('#booking-success').html('').hide();

            // Collect form data
            // Build special requirements from checked options
            const specialRequirements = [];
            let otherRequirementText = '';

            if ($('#booking-wheelchair').is(':checked')) {
                specialRequirements.push('Wheelchair');
            }
            if ($('#booking-carseat').is(':checked')) {
                specialRequirements.push('Carseat');
            }
            if ($('#booking-other-requirement').is(':checked')) {
                otherRequirementText = $('#booking-other-text').val().trim();
                if (otherRequirementText) {
                    specialRequirements.push('__other_option__');
                }
            }

            // Get datetime from hidden fields (populated by Flatpickr)
            const pickupDate = $('#booking-date').val();
            const pickupTime = $('#booking-time').val();

            // Get return flight data if round trip
            const returnDate = $('#booking-return-date').val();
            const returnTime = $('#booking-return-time').val();

            const formData = {
                name: $('#booking-name').val().trim(),
                phone: $('#booking-phone').data('raw-value') || $('#booking-phone').val().replace(/\D/g, ''),
                email: $('#booking-email').val().trim(),
                pickupDate: pickupDate,
                pickupAddress: $('#booking-pickup').val().trim(),
                destinationAddress: $('#booking-destination').val().trim(),
                passengers: $('#booking-passengers').val().trim(),
                specialNotes: $('#booking-notes').val().trim(),
                airportTrip: $('input[name="airport-trip"]:checked').val(),
                flightNumber: $('#booking-flight').val().trim(),
                pickupTime: pickupTime,
                checkingBags: $('#booking-checking-bags').is(':checked') ? 'Yes' : 'No',
                roundTrip: $('#booking-round-trip').is(':checked') ? 'Yes' : 'No',
                returnDate: returnDate,
                returnTime: returnTime,
                specialRequirements: specialRequirements,
                otherRequirementText: otherRequirementText
            };

            // Validation
            let errors = [];
            let isValid = true;

            // Name validation
            if (!formData.name) {
                errors.push('Name is required');
                $('#booking-name').closest('.form-group').addClass('has-error').find('.help-block').text('Name is required').show();
                isValid = false;
            }

            // Phone validation
            const rawPhone = $('#booking-phone').data('raw-value') || $('#booking-phone').val().replace(/\D/g, '');
            if (!rawPhone) {
                errors.push('Phone number is required');
                $('#booking-phone').closest('.form-group').addClass('has-error').find('.help-block').text('Phone number is required').show();
                isValid = false;
            } else if (!validatePhone(rawPhone)) {
                errors.push('Please enter a valid 10-digit phone number');
                $('#booking-phone').closest('.form-group').addClass('has-error').find('.help-block').text('Please enter a valid 10-digit phone number').show();
                isValid = false;
            }

            // Email validation (optional field, only validate if provided)
            if (formData.email && !validateEmail(formData.email)) {
                errors.push('Please enter a valid email address');
                $('#booking-email').closest('.form-group').addClass('has-error').find('.help-block').text('Please enter a valid email address').show();
                isValid = false;
            }

            // Pickup date validation
            if (!formData.pickupDate) {
                errors.push('Pickup date is required');
                $('#booking-date').closest('.form-group').addClass('has-error');
                $('#date-error').text('Pickup date is required').show();
                isValid = false;
            }

            // Pickup time validation
            if (!formData.pickupTime) {
                errors.push('Pickup time is required');
                $('#booking-time').closest('.form-group').addClass('has-error');
                $('#time-error').text('Pickup time is required').show();
                isValid = false;
            }

            // Pickup address validation
            if (!formData.pickupAddress) {
                errors.push('Pickup address is required');
                $('#booking-pickup').closest('.form-group').addClass('has-error');
                $('#pickup-error').text('Pickup address is required').show();
                isValid = false;
            } else {
                const excludedPickup = addressHasExcludedTown(formData.pickupAddress);
                if (excludedPickup) {
                    const msg = 'We do not serve ' + excludedPickup + '. Please call (980) 422-9125 with questions.';
                    errors.push(msg);
                    $('#booking-pickup').closest('.form-group').addClass('has-error');
                    $('#pickup-error').text(msg).show();
                    isValid = false;
                }
            }
            if (formData.destinationAddress) {
                const excludedDest = addressHasExcludedTown(formData.destinationAddress);
                if (excludedDest) {
                    const msg = 'We do not serve ' + excludedDest + '. Please call (980) 422-9125 with questions.';
                    errors.push(msg);
                    $('#booking-destination').closest('.form-group').addClass('has-error');
                    $('#destination-error').text(msg).show();
                    isValid = false;
                }
            }

            // Destination address validation
            if (!formData.destinationAddress) {
                errors.push('Destination address is required');
                $('#booking-destination').closest('.form-group').addClass('has-error');
                $('#destination-error').text('Destination address is required').show();
                isValid = false;
            }

            // Airport trip validation
            if (!formData.airportTrip) {
                errors.push('Please indicate if this is an airport trip');
                $('input[name="airport-trip"]').closest('.form-group').addClass('has-error').find('.help-block').text('Please select an option').show();
                isValid = false;
            }

            // Validate flight number if airport trip is yes
            if (formData.airportTrip === 'Yes' && formData.flightNumber && !validateFlightNumber(formData.flightNumber)) {
                errors.push('Please enter a valid flight number (e.g., AA1234)');
                $('#booking-flight').closest('.form-group').addClass('has-error').find('.help-block').text('Please enter a valid flight number (e.g., AA1234)').show();
                isValid = false;
            }

            // Validate "Other" special requirement text field if "Other" is checked
            if ($('#booking-other-requirement').is(':checked') && !$('#booking-other-text').val().trim()) {
                errors.push('Please specify your other special requirements');
                $('#booking-other-text').closest('.form-group').addClass('has-error');
                isValid = false;
            }

            // Validate passenger capacity
            const wheelchair = $('#booking-wheelchair').is(':checked');
            const carseat = $('#booking-carseat').is(':checked');
            const checkingBags = $('#booking-checking-bags').is(':checked');

            const requirements = {
                wheelchair: wheelchair,
                carseat: carseat,
                checkingBags: checkingBags
            };

            const maxCapacity = calculatePassengerCapacity(requirements);
            const passengerCount = parseInt(formData.passengers) || 1;

            if (passengerCount > maxCapacity) {
                const callMsg = 'For more than ' + maxCapacity + ' passengers, please call (980) 422-9125.';
                errors.push(callMsg);
                $('#booking-passengers').closest('.form-group').addClass('has-error').find('.help-block').text(callMsg).show();
                isValid = false;
            }

            // Validate return flight fields if round trip is yes
            if (formData.roundTrip === 'Yes') {
                // Return date validation
                if (!formData.returnDate) {
                    errors.push('Return flight date is required for round trips');
                    $('#booking-return-date').closest('.form-group').addClass('has-error');
                    $('#return-date-error').text('Return flight date is required').show();
                    isValid = false;
                }

                // Return time validation
                if (!formData.returnTime) {
                    errors.push('Return flight time is required for round trips');
                    $('#booking-return-time').closest('.form-group').addClass('has-error');
                    $('#return-time-error').text('Return flight time is required').show();
                    isValid = false;
                } else {
                    // Validate return date is after pickup date
                    const pickupDateTime = formData.pickupDate + ' ' + formData.pickupTime;
                    const returnDateTime = formData.returnDate + ' ' + formData.returnTime;
                    if (!validateReturnFlight(pickupDateTime, returnDateTime)) {
                        errors.push('Return date must be after pickup date');
                        isValid = false;
                    }
                }
            }

            // Re-validate date/time against latest bookings
            if (formData.pickupDate && formData.pickupTime) {
                const dateTimeValidation = await validateDateTime(formData.pickupDate, formData.pickupTime);
                if (!dateTimeValidation.valid) {
                    errors.push(dateTimeValidation.error);
                    $('#booking-date').closest('.form-group').addClass('has-error');
                    $('#date-error').text(dateTimeValidation.error).show();
                    isValid = false;
                }
            }

            // Validate return flight date/time for round-trip bookings
            if (formData.roundTrip === 'Yes' && formData.returnDate && formData.returnTime) {
                const returnDateTimeValidation = await validateDateTime(formData.returnDate, formData.returnTime);
                if (!returnDateTimeValidation.valid) {
                    errors.push('Return flight: ' + returnDateTimeValidation.error);
                    $('#booking-return-date').closest('.form-group').addClass('has-error');
                    $('#return-date-error').text(returnDateTimeValidation.error).show();
                    isValid = false;
                }

                // Same day: treat the outbound pickup as already booked when checking the return
                // (return is unavailable only if outbound + existing would need a 3rd driver).
                if (formData.pickupDate === formData.returnDate) {
                    const [pickupHours, pickupMinutes] = formData.pickupTime.split(':').map(Number);
                    const existingForReturn = await getBookingsForDate(formData.returnDate, true);
                    const withOutbound = existingForReturn.concat([{
                        hours: pickupHours,
                        minutes: pickupMinutes
                    }]);
                    if (hasTimeConflict(formData.returnDate, formData.returnTime, withOutbound)) {
                        errors.push('Return flight time conflicts with outbound flight. Please choose a different time.');
                        $('#booking-return-time').closest('.form-group').addClass('has-error');
                        $('#return-time-error').text('Conflicts with outbound flight').show();
                        isValid = false;
                    }
                }
            }

            if (errors.length > 0) {
                let errorHtml = '<div class="alert alert-danger"><strong>Please correct the following:</strong><ul style="margin: 10px 0 0 0; padding-left: 20px;">';
                errors.forEach(function(error) {
                    errorHtml += '<li>' + error + '</li>';
                });
                errorHtml += '</ul></div>';

                $('#booking-success').html(errorHtml).show();
                $('html, body').animate({
                    scrollTop: $('#booking-success').offset().top - 100
                }, 500);
                return;
            }

            // Add pending bookings to prevent race conditions
            // Extract hours and minutes for conflict detection
            const [outboundHours, outboundMinutes] = formData.pickupTime.split(':').map(Number);
            pendingBookings.push({
                date: formData.pickupDate,
                hours: outboundHours,
                minutes: outboundMinutes
            });

            // If round trip, also add return booking to pending
            if (formData.roundTrip === 'Yes' && formData.returnDate && formData.returnTime) {
                const [returnHours, returnMinutes] = formData.returnTime.split(':').map(Number);
                pendingBookings.push({
                    date: formData.returnDate,
                    hours: returnHours,
                    minutes: returnMinutes
                });
            }

            // Show submitting state
            const $submitBtn = $form.find('button[type="submit"]');
            const originalBtnText = $submitBtn.html();
            $submitBtn.html('<i class="fa fa-spinner fa-spin"></i> Submitting...').prop('disabled', true);

            try {
                console.log('=== STARTING FORM SUBMISSION ===');
                console.log('Form Data:', formData);
                console.log('Pending bookings:', pendingBookings.length);

                // Handle dual submission for round-trip bookings
                const submissions = await handleDualSubmission(formData);

                // Best-effort calendar mirror to Apps Script
                try {
                    await postBookingToCalendar(formData);
                } catch (calendarErr) {
                    console.warn('Calendar mirror error ignored:', calendarErr);
                }

                // Invalidate cache after successful submission so future validations fetch fresh data
                cachedBookings = [];
                lastFetchTime = null;
                console.log('Cache invalidated after successful submission');

                // Clear pending bookings after a delay to allow database to catch up
                // Keep them for 10 seconds to prevent immediate conflicts
                setTimeout(function() {
                    const numBookings = formData.roundTrip === 'Yes' ? 2 : 1;
                    pendingBookings.splice(0, numBookings);
                    console.log('Cleared pending bookings. Remaining:', pendingBookings.length);
                }, 10000); // 10 seconds

                console.log('=== SUBMISSION COMPLETE ===');
                console.log('Showing success message...');

                // Create appropriate success message
                let successHtml =
                    '<div class="alert alert-success">' +
                    '<h4><i class="fa fa-check-circle"></i> Request received. We\'ll call to confirm</h4>' +
                    '<p>Thank you, <strong>' + formData.name + '</strong>!</p>';

                if (formData.roundTrip === 'Yes') {
                    successHtml +=
                        '<p>Your round-trip requests were sent:</p>' +
                        '<ul style="text-align: left; display: inline-block;">' +
                        '<li><strong>Outbound:</strong> ' + formatDisplayDate(formData.pickupDate) + ' at ' + formData.pickupTime + '</li>' +
                        '<li><strong>Return:</strong> ' + formatDisplayDate(formData.returnDate) + ' at ' + formData.returnTime + '</li>' +
                        '</ul>' +
                        '<p>We will call you at <strong>' + formData.phone + '</strong> to confirm both bookings.</p>';
                } else {
                    successHtml +=
                        '<p>Your request for <strong>' + formatDisplayDate(formData.pickupDate) + '</strong> at <strong>' + formData.pickupTime + '</strong> was sent.</p>' +
                        '<p>We will call you at <strong>' + formData.phone + '</strong> to confirm your booking.</p>';
                }

                successHtml +=
                    '<hr>' +
                    '<p><strong>Important:</strong> Your booking' + (formData.roundTrip === 'Yes' ? 's are' : ' is') + ' not confirmed until you receive a call from us. If you don\'t hear from us within 2 hours, please call (980) 422-9125.</p>' +
                    '</div>';

                console.log('Setting success HTML and showing...');
                $('#booking-success').html(successHtml).show();
                console.log('#booking-success element:', $('#booking-success').length, 'Visible:', $('#booking-success').is(':visible'));

                // Hide the form (like contact form)
                console.log('Hiding form...');
                $form.slideUp();

                // Reset button
                $submitBtn.html(originalBtnText).prop('disabled', false);

                // Scroll to success message
                console.log('Scrolling to success message...');
                $('html, body').animate({
                    scrollTop: $('#booking-success').offset().top - 100
                }, 500);

                // Show option to make another booking after 2 seconds (like contact form)
                setTimeout(function() {
                    $('#booking-success').append(
                        '<p class="text-center" style="margin-top: 20px;">' +
                        '<button id="new-booking-btn" class="btn btn-outline">Make Another Booking</button>' +
                        '</p>'
                    );

                    $('#new-booking-btn').on('click', function() {
                        $form[0].reset();
                        $('#booking-success').html('').hide();
                        $('#timeline-container').hide();
                        $('#checking-bags-section').hide();
                        $('#round-trip-section').hide();
                        $('#return-flight-section').hide();
                        $('#return-timeline-container').hide();
                        $('#other-requirement-section').hide();
                        $form.slideDown();

                        // Re-calculate default datetime using simple calculation
                        const now = new Date();
                        const newDefaultDateTime = calculateSimpleDefaultTime(now);

                        // Reset Flatpickr date and time pickers to new defaults
                        const datePickerInstance = $('#booking-date')[0]._flatpickr;
                        const timePickerInstance = $('#booking-time')[0]._flatpickr;

                        if (datePickerInstance) {
                            datePickerInstance.setDate(newDefaultDateTime, true);
                        }
                        if (timePickerInstance) {
                            timePickerInstance.setDate(newDefaultDateTime, true);
                        }

                        // Update timeline
                        const dateForInput = formatLocalYmd(newDefaultDateTime);
                        updateTimeline(dateForInput);

                        // Scroll back to form
                        $('html, body').animate({
                            scrollTop: $form.offset().top - 100
                        }, 500);
                    });
                }, 2000);

            } catch (error) {
                console.error('=== SUBMISSION ERROR CAUGHT ===');
                console.error('Error:', error);
                console.error('Error message:', error.message);
                console.error('Error stack:', error.stack);

                // Clear pending bookings on error since submission failed
                const numBookings = formData.roundTrip === 'Yes' ? 2 : 1;
                pendingBookings.splice(0, numBookings);
                console.log('Cleared pending bookings due to error');

                const errorHtml =
                    '<div class="alert alert-danger">' +
                    '<h4><i class="fa fa-exclamation-triangle"></i> Submission Error</h4>' +
                    '<p>We could not send your booking request. Please call (980) 422-9125 to book.</p>' +
                    '<p><strong>Error:</strong> ' + error.message + '</p>' +
                    '</div>';

                console.log('Setting error HTML and showing...');
                $('#booking-success').html(errorHtml).show();
                console.log('#booking-success element:', $('#booking-success').length, 'Visible:', $('#booking-success').is(':visible'));

                $submitBtn.html(originalBtnText).prop('disabled', false);

                $('html, body').animate({
                    scrollTop: $('#booking-success').offset().top - 100
                }, 500);
            }
        });

        // Pre-fetch bookings, then initialize timeline with default date
        const todayForTimeline = formatLocalYmd(defaultDateTime);
        fetchBookings().then(function() {
            // Now that bookings are cached, update the timeline
            updateTimeline(todayForTimeline, function(bookings) {
                currentDateBookings = bookings;
            });
        });

        // Initialize passenger capacity display
        updatePassengerCapacity();
        updateQuoteDisplay();
        $('#booking-quote').show();
    });

    })(jQuery);

/* Price total (owner rule): fare = larger of minimum or miles x rate; card adds 3%.
   Only dollar totals are shown to customers, never the rate or minimum. */
!function($){
    if(!$)return;
    var QUOTE_MIN=70, QUOTE_PER_MILE=2.75, QUOTE_CARD_FEE=0.03;
    var QUOTE_FALLBACK='We\'ll confirm your price when we call.';
    var QUOTE_PROMPT='Enter your pickup address and airport to see your price.';
    var AIRPORTS={
        CLT:{name:'Charlotte Douglas Airport (CLT)',lat:35.2140,lon:-80.9431},
        JQF:{name:'Concord Regional Airport',lat:35.3878,lon:-80.7091}
    };
    var BAD_TOWNS=['Mooresville','Cornelius','Davidson','Huntersville','Troutman','Statesville'];
    var geoCache={}, routeCache={}, timer=null, seq=0;
    function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
    function money(n){return '$'+n.toFixed(2);}
    function whichAirport(d){
        d=String(d||'');
        if(/\bCLT\b|charlotte|douglas/i.test(d))return 'CLT';
        if(/concord|\bJQF\b/i.test(d))return 'JQF';
        return null;
    }
    function badTown(a){for(var i=0;i<BAD_TOWNS.length;i++){if(new RegExp('\\b'+BAD_TOWNS[i]+'\\b','i').test(a))return true;}return false;}
    function censusGeo(a){
        return new Promise(function(res,rej){
            $.ajax({url:'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress',
                data:{address:a,benchmark:'Public_AR_Current',format:'jsonp'},dataType:'jsonp',timeout:8000,
                success:function(r){var m=r&&r.result&&r.result.addressMatches;
                    if(m&&m.length&&m[0].coordinates)res({lat:m[0].coordinates.y,lon:m[0].coordinates.x});else rej('nomatch');},
                error:function(){rej('census');}});
        });
    }
    function osmGeo(a){
        var q=/\bNC\b|north carolina/i.test(a)?a:a+', NC';
        return fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&viewbox=-81.4,35.9,-80.4,35.0&q='+encodeURIComponent(q))
            .then(function(r){return r.json();}).then(function(j){
                if(j&&j.length)return {lat:+j[0].lat,lon:+j[0].lon};throw 'nomatch';});
    }
    function geocode(a){
        var k=a.toLowerCase();
        if(geoCache[k])return geoCache[k];
        var p=censusGeo(a).catch(function(){return osmGeo(a);});
        geoCache[k]=p; p.catch(function(){delete geoCache[k];});
        return p;
    }
    function inArea(g){return g.lat>34.9&&g.lat<36.2&&g.lon>-81.8&&g.lon<-80.2;}
    function driveMiles(g,ap){
        var k=g.lat.toFixed(5)+','+g.lon.toFixed(5)+'>'+ap;
        if(routeCache[k])return routeCache[k];
        var A=AIRPORTS[ap];
        var p=fetch('https://router.project-osrm.org/route/v1/driving/'+g.lon+','+g.lat+';'+A.lon+','+A.lat+'?overview=false')
            .then(function(r){return r.json();}).then(function(j){
                if(j&&j.code==='Ok'&&j.routes&&j.routes.length)return j.routes[0].distance/1609.344;throw 'noroute';});
        routeCache[k]=p; p.catch(function(){delete routeCache[k];});
        return p;
    }
    function show(html){var $d=$('#quote-details');if($d.length)$d.html(html);}
    function refresh(){
        var pick=$.trim($('#booking-pickup').val()||'');
        var ap=whichAirport($('#booking-destination').val());
        var rt=$('#booking-round-trip').is(':checked');
        var my=++seq;
        if(pick.length<6||!/\d/.test(pick)){show(QUOTE_PROMPT);return;}
        var dest=$.trim($('#booking-destination').val()||'');
        if(!ap){show(dest.length>3?QUOTE_FALLBACK:QUOTE_PROMPT);return;}
        if(badTown(pick)){show(QUOTE_FALLBACK);return;}
        show('Figuring your price&hellip;');
        geocode(pick).then(function(g){
            if(!inArea(g))throw 'area';
            return driveMiles(g,ap);
        }).then(function(mi){
            if(my!==seq)return;
            var one=Math.round(Math.max(QUOTE_MIN,mi*QUOTE_PER_MILE)*100)/100;
            var cash=rt?one*2:one;
            var card=Math.round(cash*(1+QUOTE_CARD_FEE)*100)/100;
            var label=rt?'Round trip, '+esc(AIRPORTS[ap].name)+' and back':'One way to '+esc(AIRPORTS[ap].name);
            show('<span class="quote-label">'+label+'</span><br><strong class="quote-total">Cash '+money(cash)+' &middot; Card '+money(card)+'</strong>');
        }).catch(function(){if(my===seq)show(QUOTE_FALLBACK);});
    }
    function later(){clearTimeout(timer);timer=setTimeout(refresh,900);}
    $(function(){
        $('#booking-pickup, #booking-destination').on('input', later).on('change blur', function(){clearTimeout(timer);refresh();});
        $('#booking-round-trip, input[name="airport-trip"]').on('change', function(){setTimeout(refresh,50);});
        refresh();
    });
}(window.jQuery);
