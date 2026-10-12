(() => {
  const labels = {
    instagram: 'Instagram',
    facebook: 'Facebook',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    x: 'X',
    whatsapp: 'WhatsApp',
  };

  function setFooterContactLink(element, value, href) {
    if (!element) return;
    element.hidden = !value;
    if (!value) return;
    element.textContent = value;
    element.href = href;
  }

  if (!window.DriveLinkAPI) return;

  DriveLinkAPI.get('/api/site-settings/contact').then((contact) => {
    const heading = document.getElementById('siteContactHeading');
    if (heading) heading.textContent = contact.heading || 'Kontak';

    const phone = String(contact.phone || '').trim();
    const phoneHref = phone.replace(/[^\d+]/g, '');
    setFooterContactLink(document.getElementById('rentalFooterPhone'), phone, phoneHref ? `tel:${phoneHref}` : '');

    const email = String(contact.email || '').trim();
    setFooterContactLink(document.getElementById('rentalFooterEmail'), email, email ? `mailto:${email}` : '');

    const whatsapp = String(contact.whatsapp || '').trim();
    const whatsappDigits = whatsapp.replace(/\D/g, '');
    const whatsappLink = document.getElementById('rentalFooterWhatsapp');
    setFooterContactLink(whatsappLink, whatsapp, whatsappDigits ? `https://wa.me/${whatsappDigits}` : '');
    if (whatsappLink && whatsappDigits) {
      whatsappLink.target = '_blank';
      whatsappLink.rel = 'noopener noreferrer';
      whatsappLink.setAttribute('aria-label', `Hubungi melalui WhatsApp: ${whatsapp}`);
    }

    const socialLinks = document.getElementById('footerSocialLinks');
    if (!socialLinks) return;
    socialLinks.replaceChildren();
    for (const item of contact.socialLinks || []) {
      if (!labels[item.platform] || !item.url) continue;
      const link = document.createElement('a');
      link.className = `footer-social-icon is-${item.platform}`;
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', labels[item.platform]);
      link.title = labels[item.platform];
      link.innerHTML = window.DriveLinkSocialIcon?.(item.platform) || '';
      socialLinks.append(link);
    }
    socialLinks.hidden = !socialLinks.childElementCount;
  }).catch((error) => console.error('Kontak website gagal dimuat dari server.', error));

  const locationLink = document.getElementById('rentalFooterLocation');
  if (!locationLink) return;
  DriveLinkAPI.get('/api/location').then((location) => {
    if (!location?.address) {
      locationLink.hidden = true;
      return;
    }
    locationLink.textContent = location.address;
    locationLink.href = location.mapsUrl;
    locationLink.target = '_blank';
    locationLink.rel = 'noopener noreferrer';
  }).catch((error) => console.error('Alamat footer gagal dimuat dari server.', error));
})();
