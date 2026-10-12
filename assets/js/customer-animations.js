(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isAdminPage = window.location.pathname.split('/').pop().startsWith('admin');
  if (isAdminPage) return;

  function createJourneyIntro() {
    const currentPage = window.location.pathname.split('/').pop();
    if (reduceMotion || currentPage && currentPage !== 'index.html') return;
    try {
      if (sessionStorage.getItem('drivelink-journey-intro-seen')) return;
      sessionStorage.setItem('drivelink-journey-intro-seen', '1');
    } catch (error) {
      console.warn('Animasi pembuka tidak dapat menyimpan status sesi.', error);
    }

    const intro = document.createElement('div');
    intro.className = 'journey-intro';
    intro.setAttribute('role', 'status');
    intro.setAttribute('aria-label', 'Animasi perjalanan DriveLink');
    intro.innerHTML = `
      <div class="journey-intro-card">
        <div class="journey-brand"><span class="brand-mark">D</span><strong>DriveLink</strong></div>
        <div class="journey-route" aria-hidden="true">
          <span class="journey-route-point journey-route-start">⌖</span>
          <span class="journey-route-line"><i></i></span>
          <span class="journey-route-point journey-route-end">✓</span>
          <svg class="journey-car" viewBox="0 0 96 52" role="presentation">
            <path d="M15 33h66l-5-15a8 8 0 0 0-7-5H34a9 9 0 0 0-8 5l-8 15Z" fill="currentColor"/>
            <path d="m31 17-6 12h18V17H31Zm17 0v12h22l-4-12H48Z" fill="#dce8ff"/>
            <path d="M10 32h76a5 5 0 0 1 5 5v4H6v-4a5 5 0 0 1 4-5Z" fill="currentColor"/>
            <circle cx="25" cy="41" r="8" fill="#14223c"/><circle cx="25" cy="41" r="3.5" fill="#c8d6ff"/>
            <circle cx="72" cy="41" r="8" fill="#14223c"/><circle cx="72" cy="41" r="3.5" fill="#c8d6ff"/>
            <path d="M81 31h8v5h-8Z" fill="#ffe28a"/>
          </svg>
        </div>
        <span class="eyebrow">Perjalanan dimulai</span>
        <h2>Selamat datang di DriveLink</h2>
        <p>Siapkan perjalanan Anda dengan nyaman.</p>
        <button class="journey-skip" type="button">Lewati animasi</button>
      </div>`;
    document.body.append(intro);

    let removed = false;
    const dismiss = () => {
      if (removed) return;
      removed = true;
      intro.classList.add('is-leaving');
      window.setTimeout(() => intro.remove(), 280);
    };
    intro.querySelector('.journey-skip').addEventListener('click', dismiss);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') dismiss();
    }, { once: true });
    window.setTimeout(dismiss, 1500);
  }

  function createFeatureNotice() {
    const notice = document.createElement('aside');
    notice.className = 'customer-feature-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    const icon = document.createElement('span');
    icon.className = 'customer-feature-notice-icon';
    icon.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('div');
    copy.className = 'customer-feature-notice-copy';
    const title = document.createElement('strong');
    const description = document.createElement('span');
    copy.append(title, description);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'customer-feature-notice-close';
    close.setAttribute('aria-label', 'Tutup info fitur');
    close.textContent = '×';
    notice.append(icon, copy, close);
    document.body.append(notice);

    let dismissTimer;
    const dismiss = () => {
      window.clearTimeout(dismissTimer);
      notice.classList.remove('is-visible');
    };
    close.addEventListener('click', dismiss);

    return (card) => {
      const sourceIcon = card.querySelector('.feature-icon');
      const heading = card.querySelector('h3');
      const detail = card.querySelector('p');
      if (!sourceIcon || !heading) return;
      icon.textContent = sourceIcon.textContent.trim();
      title.textContent = heading.textContent.trim();
      description.textContent = detail?.textContent.trim() || 'Fitur ini membantu perjalanan Anda lebih nyaman.';
      notice.classList.remove('is-visible', 'is-animated');
      sourceIcon.classList.remove('is-click-animated');
      void notice.offsetWidth;
      notice.classList.add('is-visible');
      sourceIcon.classList.add('is-click-animated');
      if (!reduceMotion) notice.classList.add('is-animated');
      window.clearTimeout(dismissTimer);
      dismissTimer = window.setTimeout(dismiss, 5200);
    };
  }

  function setupNavigationAnimations() {
    const iconSvg = (paths) => `<svg viewBox="0 0 64 64" focusable="false" aria-hidden="true">${paths}</svg>`;
    const pageAnimations = {
      'index.html': {
        icon: iconSvg('<path d="m9 29 23-19 23 19v25H37V38H27v16H9V29Z"/><path d="M5 30 32 7l9 8"/>'),
        title: 'Beranda', detail: 'Temukan perjalanan baru bersama DriveLink.',
      },
      'fleet.html': {
        icon: iconSvg('<path d="m11 36 4-14a7 7 0 0 1 7-5h20a7 7 0 0 1 7 5l4 14"/><path d="M8 36h48v12H8z"/><path d="M15 48v5m34-5v5M17 36h30"/><circle cx="17" cy="42" r="2"/><circle cx="47" cy="42" r="2"/>'),
        title: 'Harga Unit', detail: 'Melihat pilihan kendaraan dan harga sewanya.',
      },
      'features.html': {
        icon: iconSvg('<path d="m32 7 5.8 17.2L55 30l-17.2 5.8L32 53l-5.8-17.2L9 30l17.2-5.8L32 7Z"/><path d="m50 7 2.2 6.8L59 16l-6.8 2.2L50 25l-2.2-6.8L41 16l6.8-2.2L50 7Z"/><path d="m13 42 1.7 5.3L20 49l-5.3 1.7L13 56l-1.7-5.3L6 49l5.3-1.7L13 42Z"/>'),
        title: 'Fitur', detail: 'Menjelajahi fitur pintar DriveLink.',
      },
      'pricing.html': {
        icon: iconSvg('<path d="M34 9H13a4 4 0 0 0-4 4v21l25 21 22-22L35 9Z"/><circle cx="21" cy="21" r="3"/><path d="m30 40 12-12m-10 1h.1M42 39h.1"/>'),
        title: 'Paket Perjalanan', detail: 'Menjelajahi paket dan promo untuk perjalanan Anda.',
      },
      'reviews.html': {
        icon: iconSvg('<path d="m32 8 7.2 14.6 16.1 2.3-11.7 11.4 2.8 16.1L32 44.8l-14.4 7.6 2.8-16.1L8.7 24.9l16.1-2.3L32 8Z"/><path d="m28 34 3 3 6-7"/>'),
        title: 'Ulasan', detail: 'Melihat pengalaman perjalanan pelanggan.',
      },
      'booking.html': {
        icon: iconSvg('<rect x="10" y="14" width="44" height="40" rx="7"/><path d="M21 8v12m22-12v12M10 26h44"/><path d="m24 40 5 5 11-12"/>'),
        title: 'Booking', detail: 'Menyiapkan perjalanan Anda.',
      },
      'handover.html': {
        icon: iconSvg('<path d="m9 34 4-14a7 7 0 0 1 7-5h24a7 7 0 0 1 7 5l4 14"/><path d="M7 34h50v14H7z"/><path d="M15 48v5m34-5v5"/><circle cx="18" cy="41" r="2"/><circle cx="46" cy="41" r="2"/><path d="m25 27 5 5 10-11"/>'),
        title: 'Serah-terima', detail: 'Memeriksa kondisi unit sebelum perjalanan dimulai.',
      },
      'orders.html': {
        icon: iconSvg('<path d="M18 8h22l8 8v40H18a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4Z"/><path d="M40 8v10h10M23 29h18m-18 8h18m-18 8h10"/>'),
        title: 'Pesanan Saya', detail: 'Melihat status dan detail pesanan Anda.',
      },
    };
    let navigating = false;

    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element) || event.button !== 0
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest('.nav a[href], a.btn[href]');
      if (!link || link.target && link.target !== '_self' || link.hasAttribute('download')) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      const animation = pageAnimations[destination.pathname.split('/').pop()];
      if (!animation) return;
      if (reduceMotion) return;

      event.preventDefault();
      if (navigating) return;
      navigating = true;

      const overlay = document.createElement('div');
      overlay.className = 'nav-transition-overlay';
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      const icon = document.createElement('span');
      icon.className = 'nav-transition-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = animation.icon;
      const title = document.createElement('strong');
      title.textContent = animation.title;
      const detail = document.createElement('span');
      detail.textContent = animation.detail;
      overlay.append(icon, title, detail);
      document.body.append(overlay);
      window.setTimeout(() => window.location.assign(destination.href), 620);
    });
  }

  createJourneyIntro();
  setupNavigationAnimations();
  const showFeature = createFeatureNotice();
  document.querySelectorAll('.feature-item').forEach((card) => {
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    const heading = card.querySelector('h3');
    if (heading) card.setAttribute('aria-label', `Lihat fitur ${heading.textContent.trim()}`);
    card.addEventListener('click', () => showFeature(card));
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      showFeature(card);
    });
  });
})();
