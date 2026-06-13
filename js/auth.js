/**
 * @fileoverview Google OAuth 2.0 authentication manager.
 * Uses Google Identity Services (GSI) token flow.
 * Token stored in sessionStorage — cleared on browser close.
 */

'use strict';

/**
 * Authentication manager singleton.
 * Handles Google OAuth 2.0 login, token storage, and access control.
 */
const AuthManager = (() => {
  const SESSION_KEY = 'finance_oauth_token';
  const SESSION_EMAIL_KEY = 'finance_user_email';
  const SESSION_EXPIRY_KEY = 'finance_token_expiry';

  let tokenClient = null;
  let resolveTokenPromise = null;
  let rejectTokenPromise = null;

  /**
   * Checks whether the current URL has the ?readonly=true parameter.
   * @returns {boolean} True if read-only mode is active.
   */
  function isReadOnly() {
    return new URLSearchParams(window.location.search).get('readonly') === 'true';
  }

  /**
   * Returns the currently stored OAuth access token, or null if not authenticated.
   * @returns {string|null} The Bearer access token.
   */
  function getToken() {
    const expiry = sessionStorage.getItem(SESSION_EXPIRY_KEY);
    if (expiry && Date.now() > parseInt(expiry, 10)) {
      clearSession();
      return null;
    }
    return sessionStorage.getItem(SESSION_KEY);
  }

  /**
   * Returns the authenticated user's email address.
   * @returns {string|null} User email or null.
   */
  function getUserEmail() {
    return sessionStorage.getItem(SESSION_EMAIL_KEY);
  }

  /**
   * Clears all session auth data.
   */
  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_EMAIL_KEY);
    sessionStorage.removeItem(SESSION_EXPIRY_KEY);
  }

  /**
   * Validates that the given email is allowed to access the app.
   * In readonly mode, also checks READONLY_ALLOWED_EMAILS.
   * @param {string} email - The user's email to validate.
   * @returns {boolean} True if access is permitted.
   */
  function isEmailAllowed(email) {
    if (!email) return false;
    if (email === CONFIG.ALLOWED_EMAIL) return true;
    if (isReadOnly() && CONFIG.READONLY_ALLOWED_EMAILS.includes(email)) return true;
    return false;
  }

  /**
   * Fetches user info from Google to get the authenticated email.
   * @param {string} accessToken - Valid OAuth access token.
   * @returns {Promise<string>} Resolves with the user's email.
   */
  async function fetchUserEmail(accessToken) {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error('לא ניתן לאמת את פרטי המשתמש');
    }
    const data = await response.json();
    return data.email;
  }

  /**
   * Persists the OAuth token and email in sessionStorage.
   * @param {string} accessToken - The OAuth access token.
   * @param {string} email - The authenticated user's email.
   * @param {number} expiresIn - Token lifetime in seconds.
   */
  function saveSession(accessToken, email, expiresIn) {
    sessionStorage.setItem(SESSION_KEY, accessToken);
    sessionStorage.setItem(SESSION_EMAIL_KEY, email);
    // Subtract 60 seconds as a safety buffer
    const expiryMs = Date.now() + (expiresIn - 60) * 1000;
    sessionStorage.setItem(SESSION_EXPIRY_KEY, String(expiryMs));
  }

  /**
   * Initialises the Google Identity Services token client.
   * Must be called after the GSI script has loaded.
   * @returns {Promise<void>}
   */
  function initTokenClient() {
    return new Promise((resolve) => {
      const scope = isReadOnly() ? CONFIG.SCOPES_READONLY : CONFIG.SCOPES;
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope,
        callback: async (tokenResponse) => {
          if (tokenResponse.error) {
            if (rejectTokenPromise) {
              rejectTokenPromise(new Error(tokenResponse.error));
            }
            return;
          }
          try {
            const email = await fetchUserEmail(tokenResponse.access_token);
            if (!isEmailAllowed(email)) {
              clearSession();
              if (rejectTokenPromise) {
                rejectTokenPromise(new Error(`הגישה נדחתה. כתובת האימייל ${email} אינה מורשית.`));
              }
              return;
            }
            saveSession(tokenResponse.access_token, email, tokenResponse.expires_in || 3600);
            if (resolveTokenPromise) {
              resolveTokenPromise(email);
            }
          } catch (err) {
            if (rejectTokenPromise) {
              rejectTokenPromise(err);
            }
          }
        },
      });
      resolve();
    });
  }

  /**
   * Triggers the Google OAuth popup and waits for the user to authenticate.
   * @returns {Promise<string>} Resolves with the authenticated email.
   */
  function requestToken() {
    return new Promise((resolve, reject) => {
      resolveTokenPromise = resolve;
      rejectTokenPromise = reject;
      tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  }

  /**
   * Initialises the auth module on a protected page.
   * If the user is already authenticated (valid token in session), resolves immediately.
   * Otherwise triggers the OAuth flow or redirects to login.
   * @param {Object} [options] - Options object.
   * @param {boolean} [options.redirectOnFail=true] - Redirect to index.html if not authenticated.
   * @returns {Promise<string|null>} Resolves with the user's email or null.
   */
  async function init({ redirectOnFail = true } = {}) {
    // If GSI is not available, wait for it
    if (typeof google === 'undefined') {
      await new Promise((resolve) => {
        window.addEventListener('load', resolve, { once: true });
      });
    }

    await initTokenClient();

    // Apply read-only mode UI restrictions
    if (isReadOnly()) {
      document.querySelectorAll('.write-only').forEach((el) => {
        el.style.display = 'none';
      });
    }

    const existingToken = getToken();
    if (existingToken) {
      return getUserEmail();
    }

    if (redirectOnFail) {
      window.location.href = 'index.html';
      return null;
    }

    return null;
  }

  /**
   * Signs the user out: revokes the token and clears session storage.
   */
  function signOut() {
    const token = getToken();
    if (token) {
      google.accounts.oauth2.revoke(token, () => {});
    }
    clearSession();
    window.location.href = 'index.html';
  }

  /**
   * Performs the full login flow — call this from the login page.
   * @returns {Promise<string>} Resolves with the authenticated email.
   */
  async function login() {
    if (typeof google === 'undefined') {
      throw new Error('Google Identity Services לא נטען. בדוק את החיבור לאינטרנט.');
    }
    await initTokenClient();
    return requestToken();
  }

  // Public API
  return {
    init,
    login,
    signOut,
    getToken,
    getUserEmail,
    isReadOnly,
    isEmailAllowed,
  };
})();
