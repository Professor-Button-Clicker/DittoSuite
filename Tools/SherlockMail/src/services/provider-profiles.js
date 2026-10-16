const PROVIDERS = [
  {
    id: 'gmail',
    name: 'Gmail / Google Workspace',
    icon: 'G',
    domains: ['gmail.com', 'googlemail.com'],
    businessDomains: true,
    protocols: [
      { id: 'gmail_api', label: 'Gmail API (Recommended)', recommended: true },
      { id: 'imap', label: 'IMAP', preset: { host: 'imap.gmail.com', port: 993, tls: true } },
      { id: 'pop3', label: 'POP3', preset: { host: 'pop.gmail.com', port: 995, tls: true } },
    ],
    notes: 'Gmail API provides the most complete collection with label support and raw MIME download. Requires one-time Google Cloud OAuth setup.',
    oauthRequired: true,
  },
  {
    id: 'microsoft',
    name: 'Outlook / Microsoft 365',
    icon: 'M',
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'outlook.co.uk', 'hotmail.co.uk', 'live.co.uk'],
    businessDomains: true,
    protocols: [
      { id: 'graph', label: 'Microsoft Graph API (Recommended)', recommended: true },
      { id: 'ews', label: 'Exchange Web Services' },
      { id: 'imap', label: 'IMAP', preset: { host: 'outlook.office365.com', port: 993, tls: true } },
      { id: 'pop3', label: 'POP3', preset: { host: 'outlook.office365.com', port: 995, tls: true } },
    ],
    notes: 'Graph API is the modern replacement for EWS. Supports mail, OneDrive, and SharePoint. Free Azure AD app registration.',
    oauthRequired: true,
  },
  {
    id: 'zoho',
    name: 'Zoho Mail',
    icon: 'Z',
    domains: ['zoho.com', 'zohomail.com', 'zohomail.eu', 'zohomail.in'],
    businessDomains: true,
    protocols: [
      { id: 'zoho_api', label: 'Zoho Mail API (Recommended)', recommended: true },
      { id: 'imap', label: 'IMAP', preset: { host: 'imap.zoho.com', port: 993, tls: true } },
      { id: 'pop3', label: 'POP3', preset: { host: 'pop.zoho.com', port: 995, tls: true } },
    ],
    notes: 'Zoho Mail API provides full REST access to messages, folders, and attachments. Regional endpoints for US, EU, IN, AU, JP. OAuth 2.0 required.',
    oauthRequired: true,
  },
  {
    id: 'fastmail',
    name: 'Fastmail',
    icon: 'F',
    domains: ['fastmail.com', 'fastmail.fm', 'messagingengine.com'],
    protocols: [
      { id: 'jmap', label: 'JMAP API (Recommended)', recommended: true },
      { id: 'imap', label: 'IMAP', preset: { host: 'imap.fastmail.com', port: 993, tls: true } },
      { id: 'pop3', label: 'POP3', preset: { host: 'pop.fastmail.com', port: 995, tls: true } },
    ],
    notes: 'JMAP is an open standard (RFC 8621) — modern, efficient, JSON-based. Generate an API token in Fastmail Settings > Privacy & Security.',
    oauthRequired: false,
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    icon: 'Y',
    domains: ['yahoo.com', 'yahoo.co.uk', 'yahoo.co.jp', 'yahoo.ca', 'yahoo.com.au', 'yahoo.fr', 'yahoo.de', 'yahoo.it', 'ymail.com', 'rocketmail.com'],
    protocols: [
      { id: 'imap', label: 'IMAP (Recommended)', recommended: true, preset: { host: 'imap.mail.yahoo.com', port: 993, tls: true } },
      { id: 'pop3', label: 'POP3', preset: { host: 'pop.mail.yahoo.com', port: 995, tls: true } },
    ],
    notes: 'No REST API available. Use IMAP with an app-specific password (generate in Yahoo Account Security settings).',
  },
  {
    id: 'aol',
    name: 'AOL Mail',
    icon: 'A',
    domains: ['aol.com', 'aim.com', 'verizon.net'],
    protocols: [
      { id: 'imap', label: 'IMAP (Recommended)', recommended: true, preset: { host: 'imap.aol.com', port: 993, tls: true } },
      { id: 'pop3', label: 'POP3', preset: { host: 'pop.aol.com', port: 995, tls: true } },
    ],
    notes: 'No REST API available. Uses same infrastructure as Yahoo. Generate an app-specific password in AOL account settings.',
  },
  {
    id: 'icloud',
    name: 'iCloud Mail',
    icon: 'i',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    protocols: [
      { id: 'imap', label: 'IMAP (Recommended)', recommended: true, preset: { host: 'imap.mail.me.com', port: 993, tls: true } },
    ],
    notes: 'No REST API. Requires an app-specific password generated from appleid.apple.com. POP3 not supported.',
  },
  {
    id: 'protonmail',
    name: 'ProtonMail',
    icon: 'P',
    domains: ['protonmail.com', 'proton.me', 'pm.me', 'protonmail.ch'],
    protocols: [
      { id: 'imap', label: 'IMAP via Proton Bridge (Recommended)', recommended: true, preset: { host: '127.0.0.1', port: 1143, tls: false } },
    ],
    notes: 'Requires Proton Mail Bridge running locally (paid plans only). Bridge exposes local IMAP on port 1143. No direct API access.',
  },
  {
    id: 'yandex',
    name: 'Yandex Mail',
    icon: 'Ya',
    domains: ['yandex.com', 'yandex.ru', 'yandex.ua', 'ya.ru'],
    protocols: [
      { id: 'imap', label: 'IMAP (Recommended)', recommended: true, preset: { host: 'imap.yandex.com', port: 993, tls: true } },
      { id: 'pop3', label: 'POP3', preset: { host: 'pop.yandex.com', port: 995, tls: true } },
    ],
    notes: 'No public REST API for personal accounts. Use IMAP with an app password from Yandex account settings.',
  },
  {
    id: 'other',
    name: 'Other / Custom',
    icon: '?',
    domains: [],
    protocols: [
      { id: 'imap', label: 'IMAP (Recommended)', recommended: true },
      { id: 'pop3', label: 'POP3' },
      { id: 'ews', label: 'Exchange Web Services' },
    ],
    notes: 'Enter server details manually. IMAP is the most widely supported protocol for forensic collection.',
  },
];

const COLLECTION_PROFILES = {
  gmail: [
    { id: 'gmail-api-oauth', name: 'Gmail API (OAuth 2.0)', protocol: 'gmail_api', priority: 1, auth: 'oauth2', preset: {}, description: 'Full Gmail API access via OAuth. Best for complete collection with labels, raw MIME, and trash/spam access.', setup: 'Create a Google Cloud project, enable Gmail API, configure OAuth consent screen, download client_secret.json.', forensicValue: 'HIGH', limitations: [] },
    { id: 'gmail-imap-apppass', name: 'IMAP (App Password)', protocol: 'imap', priority: 2, auth: 'app-password', preset: { host: 'imap.gmail.com', port: 993, tls: true }, description: 'Standard IMAP with app-specific password. Works when API access is restricted by admin or 2FA is enabled.', setup: 'Enable 2-Step Verification, then generate an App Password at myaccount.google.com/apppasswords.', forensicValue: 'HIGH', limitations: ['Labels appear as folders', 'No trash/spam by default'] },
    { id: 'gmail-imap-oauth', name: 'IMAP (OAuth XOAUTH2)', protocol: 'imap', priority: 3, auth: 'oauth2', preset: { host: 'imap.gmail.com', port: 993, tls: true }, description: 'IMAP using OAuth2 XOAUTH2 SASL mechanism. For organizations that disable app passwords but allow IMAP.', setup: 'Same OAuth setup as Gmail API. Token is used for IMAP AUTHENTICATE XOAUTH2.', forensicValue: 'HIGH', limitations: ['Requires OAuth credentials already configured'] },
    { id: 'gmail-pop3-apppass', name: 'POP3 (App Password)', protocol: 'pop3', priority: 4, auth: 'app-password', preset: { host: 'pop.gmail.com', port: 995, tls: true }, description: 'Last resort. POP3 only accesses recent messages in Inbox. Enable POP in Gmail settings first.', setup: 'Gmail Settings > Forwarding and POP/IMAP > Enable POP. Generate App Password.', forensicValue: 'LOW', limitations: ['Inbox only', 'No folders', 'May only show recent 30 days', 'No server-side search'] },
  ],
  microsoft: [
    { id: 'ms-graph-oauth', name: 'Graph API (OAuth 2.0)', protocol: 'graph', priority: 1, auth: 'oauth2', preset: {}, description: 'Modern Microsoft Graph REST API. Best for M365 and Exchange Online with delegated or app-only auth.', setup: 'Register app in Azure AD (portal.azure.com > App registrations). Add Mail.Read permissions.', forensicValue: 'HIGH', limitations: [] },
    { id: 'ms-ews-oauth', name: 'EWS (OAuth 2.0)', protocol: 'ews', priority: 2, auth: 'oauth2', preset: {}, description: 'Exchange Web Services with OAuth. Works on Exchange Online and hybrid. Supports eDiscovery and Recoverable Items.', setup: 'Same Azure AD app as Graph. Add full_access_as_app or EWS.AccessAsUser.All permission.', forensicValue: 'HIGH', limitations: ['Being deprecated by Microsoft', 'Throttling limits apply'] },
    { id: 'ms-ews-basic', name: 'EWS (Basic Auth)', protocol: 'ews', priority: 3, auth: 'password', preset: {}, description: 'Legacy EWS with username/password. Only for on-premises Exchange where Basic Auth is still enabled.', setup: 'Use domain\\username format. Autodiscover resolves the EWS endpoint automatically.', forensicValue: 'HIGH', limitations: ['Basic Auth disabled on Exchange Online since Oct 2022', 'On-premises only'] },
    { id: 'ms-imap-oauth', name: 'IMAP (OAuth XOAUTH2)', protocol: 'imap', priority: 4, auth: 'oauth2', preset: { host: 'outlook.office365.com', port: 993, tls: true }, description: 'IMAP with OAuth2 for Exchange Online. Basic Auth IMAP was disabled; OAuth is required.', setup: 'Same Azure AD app. Enable IMAP in user mailbox settings (Exchange Admin Center).', forensicValue: 'MEDIUM', limitations: ['Must be enabled per-mailbox', 'No server-side search as rich as EWS/Graph'] },
    { id: 'ms-pop3-oauth', name: 'POP3 (OAuth XOAUTH2)', protocol: 'pop3', priority: 5, auth: 'oauth2', preset: { host: 'outlook.office365.com', port: 995, tls: true }, description: 'POP3 with OAuth2. Last resort for Exchange Online when IMAP is disabled.', setup: 'Enable POP in mailbox settings. Same Azure AD app with POP.AccessAsUser.All.', forensicValue: 'LOW', limitations: ['Inbox only', 'No folders', 'No search'] },
  ],
  zoho: [
    { id: 'zoho-api-oauth', name: 'Zoho Mail API (OAuth 2.0)', protocol: 'zoho_api', priority: 1, auth: 'oauth2', preset: {}, description: 'Full Zoho Mail REST API. Supports all folders, attachments, and search. Regional endpoints auto-detected.', setup: 'Register at api-console.zoho.com. Select Self Client or Server-based. Choose your region (US/EU/IN/AU/JP).', forensicValue: 'HIGH', limitations: [] },
    { id: 'zoho-imap-password', name: 'IMAP (Password)', protocol: 'imap', priority: 2, auth: 'password', preset: { host: 'imap.zoho.com', port: 993, tls: true }, description: 'Standard IMAP access. Works with regular Zoho password if 2FA is off, or app password if 2FA is on.', setup: 'Enable IMAP in Zoho Mail Settings > Mail Accounts > IMAP Access. Use imap.zoho.eu for EU accounts.', forensicValue: 'HIGH', limitations: ['Regional host varies: .com (US), .eu (EU), .in (IN), .com.au (AU)'] },
    { id: 'zoho-imap-eu', name: 'IMAP — EU Region', protocol: 'imap', priority: 3, auth: 'password', preset: { host: 'imap.zoho.eu', port: 993, tls: true }, description: 'IMAP for Zoho accounts in the EU data center. Use this if the US server rejects your credentials.', setup: 'Same as IMAP but with EU endpoint. Your account region is shown in Zoho admin.', forensicValue: 'HIGH', limitations: ['Only for EU-region accounts'] },
    { id: 'zoho-pop3', name: 'POP3', protocol: 'pop3', priority: 4, auth: 'password', preset: { host: 'pop.zoho.com', port: 995, tls: true }, description: 'POP3 fallback. Inbox only, no folder support.', setup: 'Enable POP in Zoho Mail Settings > Mail Accounts > POP Access.', forensicValue: 'LOW', limitations: ['Inbox only', 'No folders', 'No search'] },
  ],
  fastmail: [
    { id: 'fm-jmap-token', name: 'JMAP (API Token)', protocol: 'jmap', priority: 1, auth: 'api-token', preset: {}, description: 'JMAP open standard (RFC 8621). Fastest and most efficient. Batch method calls, state-based sync.', setup: 'Fastmail Settings > Privacy & Security > API tokens > New API token. Grant Mail access.', forensicValue: 'HIGH', limitations: [] },
    { id: 'fm-imap-apppass', name: 'IMAP (App Password)', protocol: 'imap', priority: 2, auth: 'app-password', preset: { host: 'imap.fastmail.com', port: 993, tls: true }, description: 'Standard IMAP. Well-supported by Fastmail with full folder access and IDLE push.', setup: 'Fastmail Settings > Privacy & Security > App passwords > New app password. Select Mail access.', forensicValue: 'HIGH', limitations: ['Slightly slower than JMAP for large mailboxes'] },
    { id: 'fm-pop3', name: 'POP3 (App Password)', protocol: 'pop3', priority: 3, auth: 'app-password', preset: { host: 'pop.fastmail.com', port: 995, tls: true }, description: 'POP3 fallback. Inbox only.', setup: 'Same app password as IMAP.', forensicValue: 'LOW', limitations: ['Inbox only', 'No folders'] },
  ],
  yahoo: [
    { id: 'yahoo-imap-apppass', name: 'IMAP (App Password)', protocol: 'imap', priority: 1, auth: 'app-password', preset: { host: 'imap.mail.yahoo.com', port: 993, tls: true }, description: 'Primary collection method. Yahoo requires app-specific passwords for third-party IMAP access.', setup: 'Yahoo Account Security > Generate app password. Select "Other App" and name it.', forensicValue: 'HIGH', limitations: [] },
    { id: 'yahoo-imap-password', name: 'IMAP (Regular Password)', protocol: 'imap', priority: 2, auth: 'password', preset: { host: 'imap.mail.yahoo.com', port: 993, tls: true }, description: 'Direct password login. Only works if 2FA is disabled and "Allow less secure apps" is enabled.', setup: 'Yahoo Account Security > disable 2-Step Verification. Allow third-party access.', forensicValue: 'HIGH', limitations: ['Requires 2FA to be disabled', 'Less secure'] },
    { id: 'yahoo-pop3-apppass', name: 'POP3 (App Password)', protocol: 'pop3', priority: 3, auth: 'app-password', preset: { host: 'pop.mail.yahoo.com', port: 995, tls: true }, description: 'POP3 fallback when IMAP is blocked. Inbox only.', setup: 'Same app password as IMAP. Enable POP in Yahoo Mail Settings.', forensicValue: 'LOW', limitations: ['Inbox only', 'No folders', 'No server-side search'] },
    { id: 'yahoo-pop3-password', name: 'POP3 (Regular Password)', protocol: 'pop3', priority: 4, auth: 'password', preset: { host: 'pop.mail.yahoo.com', port: 995, tls: true }, description: 'Last resort. Direct POP3 with regular password.', setup: 'Disable 2FA. Enable POP in Yahoo Mail Settings.', forensicValue: 'LOW', limitations: ['Inbox only', 'Requires 2FA disabled', 'Less secure'] },
  ],
  aol: [
    { id: 'aol-imap-apppass', name: 'IMAP (App Password)', protocol: 'imap', priority: 1, auth: 'app-password', preset: { host: 'imap.aol.com', port: 993, tls: true }, description: 'Primary method. AOL uses Yahoo infrastructure. Requires app-specific password.', setup: 'AOL Account Security > Generate app password.', forensicValue: 'HIGH', limitations: [] },
    { id: 'aol-imap-password', name: 'IMAP (Regular Password)', protocol: 'imap', priority: 2, auth: 'password', preset: { host: 'imap.aol.com', port: 993, tls: true }, description: 'Direct login if 2FA is off and third-party access is allowed.', setup: 'Disable 2-Step Verification in AOL account settings.', forensicValue: 'HIGH', limitations: ['Requires 2FA disabled'] },
    { id: 'aol-pop3', name: 'POP3 (App Password)', protocol: 'pop3', priority: 3, auth: 'app-password', preset: { host: 'pop.aol.com', port: 995, tls: true }, description: 'POP3 fallback. Inbox only.', setup: 'Same app password. Enable POP in AOL settings.', forensicValue: 'LOW', limitations: ['Inbox only'] },
  ],
  icloud: [
    { id: 'icloud-imap-apppass', name: 'IMAP (App-Specific Password)', protocol: 'imap', priority: 1, auth: 'app-password', preset: { host: 'imap.mail.me.com', port: 993, tls: true }, description: 'Only available method. Apple requires app-specific passwords for all third-party access.', setup: 'Sign in at appleid.apple.com > Security > App-Specific Passwords > Generate.', forensicValue: 'HIGH', limitations: ['No POP3 support', 'No REST API'] },
  ],
  protonmail: [
    { id: 'proton-bridge-imap', name: 'IMAP via Proton Bridge', protocol: 'imap', priority: 1, auth: 'password', preset: { host: '127.0.0.1', port: 1143, tls: false }, description: 'Proton Bridge decrypts emails locally and serves them over IMAP. The only way to collect from ProtonMail.', setup: 'Install and run Proton Mail Bridge (paid plans only). It generates a local password for IMAP access.', forensicValue: 'HIGH', limitations: ['Requires paid Proton plan', 'Bridge must be running', 'Decryption happens locally'] },
    { id: 'proton-bridge-imap-tls', name: 'IMAP via Proton Bridge (STARTTLS)', protocol: 'imap', priority: 2, auth: 'password', preset: { host: '127.0.0.1', port: 1143, tls: true, starttls: true }, description: 'Same as above but with STARTTLS. Some Bridge versions support this for enhanced local security.', setup: 'Same setup. Toggle STARTTLS in Bridge settings if available.', forensicValue: 'HIGH', limitations: ['Not all Bridge versions support STARTTLS'] },
  ],
  yandex: [
    { id: 'yandex-imap-apppass', name: 'IMAP (App Password)', protocol: 'imap', priority: 1, auth: 'app-password', preset: { host: 'imap.yandex.com', port: 993, tls: true }, description: 'Primary method. Use app password for secure third-party access.', setup: 'Yandex ID > Security > App Passwords > Create app password.', forensicValue: 'HIGH', limitations: [] },
    { id: 'yandex-imap-password', name: 'IMAP (Regular Password)', protocol: 'imap', priority: 2, auth: 'password', preset: { host: 'imap.yandex.com', port: 993, tls: true }, description: 'Direct IMAP login. Works when 2FA is disabled.', setup: 'Enable IMAP in Yandex Mail Settings > Email clients. Disable 2FA if needed.', forensicValue: 'HIGH', limitations: ['Requires 2FA disabled'] },
    { id: 'yandex-pop3', name: 'POP3 (App Password)', protocol: 'pop3', priority: 3, auth: 'app-password', preset: { host: 'pop.yandex.com', port: 995, tls: true }, description: 'POP3 fallback. Inbox only.', setup: 'Same app password. Enable POP in Yandex Mail Settings.', forensicValue: 'LOW', limitations: ['Inbox only'] },
  ],
  other: [
    { id: 'other-imap', name: 'IMAP (Custom Server)', protocol: 'imap', priority: 1, auth: 'password', preset: { host: '', port: 993, tls: true }, description: 'Standard IMAP. Enter server details manually. Most email providers support IMAP.', setup: 'Check your provider documentation for IMAP server hostname and port.', forensicValue: 'HIGH', limitations: [] },
    { id: 'other-pop3', name: 'POP3 (Custom Server)', protocol: 'pop3', priority: 2, auth: 'password', preset: { host: '', port: 995, tls: true }, description: 'POP3 fallback. Inbox only, no folder support.', setup: 'Check your provider documentation for POP3 server hostname and port.', forensicValue: 'LOW', limitations: ['Inbox only'] },
    { id: 'other-ews', name: 'EWS (Exchange Server)', protocol: 'ews', priority: 3, auth: 'password', preset: {}, description: 'For on-premises Microsoft Exchange servers. Autodiscover resolves the endpoint.', setup: 'Provide email and credentials. Autodiscover finds the EWS endpoint automatically.', forensicValue: 'HIGH', limitations: ['Exchange servers only'] },
  ],
};

export function getProviders() {
  return PROVIDERS.map(p => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    protocols: p.protocols,
    notes: p.notes,
    oauthRequired: p.oauthRequired || false,
  }));
}

export function detectProvider(email) {
  if (!email || !email.includes('@')) return null;
  const domain = email.split('@')[1].toLowerCase();

  for (const provider of PROVIDERS) {
    if (provider.id === 'other') continue;
    if (provider.domains.includes(domain)) return provider.id;
  }

  for (const provider of PROVIDERS) {
    if (provider.businessDomains) {
      if (provider.id === 'microsoft') {
        if (domain.includes('onmicrosoft.com')) return 'microsoft';
      }
    }
  }

  return 'other';
}

export function getProvider(providerId) {
  return PROVIDERS.find(p => p.id === providerId) || PROVIDERS.find(p => p.id === 'other');
}

export function getRecommendedProtocol(providerId) {
  const provider = getProvider(providerId);
  const rec = provider.protocols.find(p => p.recommended);
  return rec || provider.protocols[0];
}

export function getPreset(providerId, protocolId) {
  const provider = getProvider(providerId);
  const proto = provider.protocols.find(p => p.id === protocolId);
  return proto?.preset || null;
}

export function getCollectionProfiles(providerId) {
  return COLLECTION_PROFILES[providerId] || COLLECTION_PROFILES.other;
}

export function getCollectionProfile(providerId, profileId) {
  const profiles = getCollectionProfiles(providerId);
  return profiles.find(p => p.id === profileId) || profiles[0];
}

export function getAllCollectionProfiles() {
  return COLLECTION_PROFILES;
}
