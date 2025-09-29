CREATE    TABLE `newsletter_analytics.shortlinks` (
          token STRING NOT NULL,
          url STRING,
          nid STRING,
          rid STRING,
          createdAt TIMESTAMP,
          expiresAt TIMESTAMP
          )
PARTITION BY DATE(createdAt) CLUSTER BY token;