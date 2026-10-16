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
    notes: 'Zoho Mail API provides full REST access to messages, folders, and attachments. Regional endpoints (US/EU/IN). Free OAuth registration.',
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
