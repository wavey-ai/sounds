const parseCookie = str =>
  str
    .split(';')
    .map(v => v.split('='))
    .reduce((acc, v) => {
      acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim());
      return acc;
    }, {});

const cookieVal = key => {
  if (!document.cookie) return null;

  const cookie = parseCookie(document.cookie);
  for (let k in cookie) {
    if (k.indexOf(key) != -1) return cookie[k];
  }

  return null;
}

const serviceHost = service => {
  const fullAddress = window.location.hostname;
  if (fullAddress.indexOf('localhost') != -1) {
    return `${service}.wavey.ai`;
  }
  const parts = fullAddress.split(".");
  const subdomain = parts[0];
  const domain = parts.slice(-2).join(".");
  const prod = subdomain.indexOf("-") == -1;
  if (prod) {
    return `live-${service}-us-east-1.${domain}`;
  } else {
    const env = subdomain.split('-')[0];
    return `${env}-${service}.${domain}`;
  }
}

module.exports = {
  apiToken: () => cookieVal('idToken'),
  apiHost: () => serviceHost('api'),
  streamHost: () => serviceHost('stream'),
};
