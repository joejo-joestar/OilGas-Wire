/**
 * Triggers.gs
 *
 * Manages custom menu creation and trigger lifecycle for the spreadsheet.
 * This is the correct way to handle events that need special permissions,
 * like logging analytics from a simple trigger.
 */

/**
 * Simple onOpen trigger that runs automatically when the spreadsheet is opened.
 * Adds a custom menu to the UI.
 */
function onOpen(e) {
    SpreadsheetApp.getUi()
        .createMenu('Newsletter Tools')
        .addItem('Enable Link Click Tracking', 'enableClickTracking')
        .addItem('Disable Link Click Tracking', 'disableClickTracking')
        .addSeparator()
        .addItem('Check Click Tracking Status', 'checkClickTrackingStatus')
        .addToUi();
}

/**
 * Enables click tracking by setting a flag in PropertiesService and creating
 * a time-driven trigger to process cached clicks.
 */
function enableClickTracking() {
    var properties = PropertiesService.getUserProperties();
    properties.setProperty('CLICK_TRACKING_ENABLED', 'true');

    // Create a time-driven trigger to process the cache every 5 minutes
    // First, delete any existing triggers to avoid duplicates
    deleteProcessCachedClicksTrigger();
    ScriptApp.newTrigger('processCachedClicks')
        .timeBased()
        .everyMinutes(5)
        .create();

    SpreadsheetApp.getUi().alert('Link click tracking has been enabled. Clicks will be logged.');
}

/**
 * Disables click tracking and removes the time-driven trigger.
 */
function disableClickTracking() {
    var properties = PropertiesService.getUserProperties();
    properties.deleteProperty('CLICK_TRACKING_ENABLED');
    deleteProcessCachedClicksTrigger(); // Clean up the trigger
    SpreadsheetApp.getUi().alert('Link click tracking has been disabled.');
}

/**
 * Checks and reports the current status of click tracking.
 */
function checkClickTrackingStatus() {
    var properties = PropertiesService.getUserProperties();
    var isEnabled = properties.getProperty('CLICK_TRACKING_ENABLED') === 'true';
    var message = isEnabled
        ? 'Link click tracking is currently ENABLED.'
        : 'Link click tracking is currently DISABLED.';
    SpreadsheetApp.getUi().alert(message);
}


/**
 * Deletes any existing time-driven triggers for the processCachedClicks function.
 */
function deleteProcessCachedClicksTrigger() {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === 'processCachedClicks') {
            ScriptApp.deleteTrigger(triggers[i]);
        }
    }
}

/**
 * Processes click events stored in the cache by the onSelectionChange trigger.
 * This function is run by an installable, time-driven trigger and has full permissions.
 */
function processCachedClicks() {
    var cache = CacheService.getUserCache();
    var key = 'clicked_links';
    var cached = cache.get(key);
    if (!cached) {
        return; // No clicks to process
    }

    var clicks = JSON.parse(cached);
    if (!clicks || clicks.length === 0) {
        return;
    }

    Logger.log('Found ' + clicks.length + ' cached clicks to process.');

    // Clear the cache immediately to prevent reprocessing
    cache.remove(key);

    // Send cached clicks to central analytics endpoint (if configured) instead
    clicks.forEach(function (click) {
        try {
            var evt = {
                timestamp: new Date(click.timestamp),
                eventType: 'click',
                eventDetail: 'sheet_headline_click',
                nid: click.nid,
                recipientHash: '',
                src: 'sheet',
                url: click.url,
                ua: '',
                referer: ''
            };
            try { sendAnalyticsEvent(evt); } catch (se) { Logger.log('sendAnalyticsEvent error: ' + (se && se.message)); }
            Logger.log('Sent cached click to analytics endpoint: ' + click.url);
        } catch (e) {
            Logger.log('Error processing a cached click event: ' + (e && e.message));
        }
    });
}
