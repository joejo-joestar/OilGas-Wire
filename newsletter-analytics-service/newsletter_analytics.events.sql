CREATE    TABLE `newsletter_analytics.events` (
          eventTimestamp TIMESTAMP,
          src STRING,
          eventType STRING,
          eventDetail STRING,
          newsletterId STRING,
          recipientHash STRING,
          url STRING,
          durationSec INTEGER,
          userAgent STRING,
          )