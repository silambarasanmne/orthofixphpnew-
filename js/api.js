/* ==========================================================================
   API HTTP CLIENT UTILITY — CENTRALIZED TOKEN & FILE DOWNLOAD HANDLER
   ========================================================================== */

const API = {
  getBaseUrl() {
    if (typeof window !== 'undefined') {
      if (window.location.protocol === 'file:') {
        return 'http://localhost:8000/api';
      }
      // Use relative /api when served via web server (BigRock Apache or local PHP server)
      return '/api';
    }
    return '/api';
  },

  get baseUrl() {
    return this.getBaseUrl();
  },

  getToken() {
    if (typeof sessionStorage !== 'undefined') {
      const sToken = sessionStorage.getItem('medicare_token') || sessionStorage.getItem('token');
      if (sToken) return sToken;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('medicare_token') || localStorage.getItem('token');
    }
    return null;
  },

  setToken(token) {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('medicare_token', token);
      sessionStorage.setItem('token', token);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('medicare_token', token);
      localStorage.setItem('token', token);
    }
  },

  removeToken() {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('medicare_token');
      sessionStorage.removeItem('medicare_user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('medicare_token');
      localStorage.removeItem('medicare_user');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  },

  getUser() {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem('medicare_user');
      if (raw) {
        try { return JSON.parse(raw); } catch (e) {}
      }
    }
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('medicare_user');
      if (raw) {
        try { return JSON.parse(raw); } catch (e) {}
      }
    }
    return null;
  },

  setUser(user) {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('medicare_user', JSON.stringify(user));
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('medicare_user', JSON.stringify(user));
    }
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(`${this.getBaseUrl()}${endpoint}`, config);
      const contentType = response.headers.get('content-type') || '';

      let data;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const textData = await response.text();
        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}. Please check backend server on port 5000.`);
        }
        try {
          data = JSON.parse(textData);
        } catch (e) {
          throw new Error('Backend server error. Please ensure Node server is running on port 5000.');
        }
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // Token expired or invalid
          if (!endpoint.includes('/auth/login')) {
            this.removeToken();
            window.location.href = 'index.html';
          }
        }
        throw new Error(data.message || 'API request failed.');
      }

      return data;
    } catch (error) {
      throw error;
    }
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    const isFormData = body instanceof FormData;
    return this.request(endpoint, {
      method: 'POST',
      body: isFormData ? body : JSON.stringify(body)
    });
  },

  put(endpoint, body) {
    const isFormData = body instanceof FormData;
    return this.request(endpoint, {
      method: 'PUT',
      body: isFormData ? body : JSON.stringify(body)
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  // AUTHENTICATED FILE DOWNLOAD UTILITY
  async downloadFile(endpoint, fallbackFilename) {
    try {
      if (typeof UI !== 'undefined') UI.showToast('Preparing download...', 'info');
      const token = this.getToken();

      if (!token) {
        if (typeof UI !== 'undefined') UI.showToast('Session expired. Redirecting to login...', 'warning');
        setTimeout(() => window.location.href = 'index.html', 1000);
        return;
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 403) {
          if (typeof UI !== 'undefined') UI.showToast('Session expired. Please log in again.', 'error');
          this.removeToken();
          setTimeout(() => window.location.href = 'index.html', 1200);
          return;
        }
        throw new Error(errJson.message || 'Download failed.');
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fallbackFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      if (typeof UI !== 'undefined') UI.showToast('Download completed successfully!', 'success');
    } catch (error) {
      if (typeof UI !== 'undefined') UI.showToast(error.message || 'Failed to download file.', 'error');
    }
  }
};

window.API = API;
