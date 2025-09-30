CREATE    TABLE `newsletter_analytics.recipient_mappings` (
          mappedAt TIMESTAMP NOT NULL,
          recipientHash STRING,
          email STRING,
          emailHash STRING,
          newsletterId STRING,
          )