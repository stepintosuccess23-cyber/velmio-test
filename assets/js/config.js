/* Site settings. Edit these values after upload; no build is needed. */
window.SITE_CONFIG = {
  // Web app URL from your Google Apps Script deployment (ends in /exec).
  formEndpoint: "",

  // Tracking IDs. Leave blank to turn a tool off.
  // If gtmId is set, add Meta and GA4 inside Tag Manager and leave those two
  // blank here, so conversions are not counted twice.
  metaPixelId: "",
  ga4Id: "",
  gtmId: "",

  // true: tracking loads only after a visitor accepts cookies.
  requireConsent: true,

  // Web API key from your Firebase project. Accounts and passwords need it.
  // Firebase designs this value to be public. It only identifies your project.
  // Your private keys belong in the Apps Script, never in this file.
  firebaseApiKey: "",

  // Web client ID from Firebase (Authentication > Google).
  // The "Continue with Google" button appears only when set.
  googleClientId: "",

  // Set to true after adding ANTHROPIC_API_KEY to the Apps Script.
  chatEnabled: false,

  // Shown in the footer and on the Contact page when filled in.
  contactEmail: "",
  contactPhone: ""
};
