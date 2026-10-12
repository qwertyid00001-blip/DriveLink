function createMenuButton(label, controls) {
  const button = document.createElement('button');
  button.className = 'mobile-menu-toggle';
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-controls', controls.id);
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<span></span><span></span><span></span>';
  return button;
}

function setupMobileMenu(container, menu, label, { persistScroll = false } = {}) {
  if (!container || !menu) return;
  menu.id ||= `mobile-menu-${Math.random().toString(36).slice(2)}`;
  const button = createMenuButton(label, menu);
  container.classList.add('has-mobile-menu');
  container.insertBefore(button, menu);

  const scrollStorageKey = 'drivelink-admin-nav-scroll';
  const sidebarScrollStorageKey = 'drivelink-admin-sidebar-scroll';
  const saveScrollPosition = () => {
    if (!persistScroll) return;
    sessionStorage.setItem(scrollStorageKey, String(menu.scrollTop));
    sessionStorage.setItem(sidebarScrollStorageKey, String(container.scrollTop));
  };
  const restoreScrollPosition = () => {
    if (!persistScroll) return;
    const savedMenuPosition = Number(sessionStorage.getItem(scrollStorageKey));
    const savedSidebarPosition = Number(sessionStorage.getItem(sidebarScrollStorageKey));
    if (Number.isFinite(savedMenuPosition)) menu.scrollTop = savedMenuPosition;
    if (Number.isFinite(savedSidebarPosition)) container.scrollTop = savedSidebarPosition;
  };
  if (persistScroll) {
    restoreScrollPosition();
    menu.addEventListener('scroll', saveScrollPosition, { passive: true });
    container.addEventListener('scroll', saveScrollPosition, { passive: true });
  }

  function setExpanded(expanded) {
    container.classList.toggle('mobile-menu-open', expanded);
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', expanded ? 'Tutup menu' : label);
    if (persistScroll && expanded) {
      requestAnimationFrame(restoreScrollPosition);
    }
  }

  button.addEventListener('click', () => {
    setExpanded(button.getAttribute('aria-expanded') !== 'true');
  });
  menu.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a');
    if (!link) return;
    if (persistScroll) {
      saveScrollPosition();
      const destination = new URL(link.href, window.location.href);
      if (!/^admin(?:-|\.html$)/.test(destination.pathname.split('/').pop())) {
        sessionStorage.removeItem(scrollStorageKey);
        sessionStorage.removeItem(sidebarScrollStorageKey);
      }
    }
    setExpanded(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setExpanded(false);
  });
  document.addEventListener('click', (event) => {
    if (!container.contains(event.target)) setExpanded(false);
  });
}

document.querySelectorAll('.nav-wrap').forEach((container) => {
  setupMobileMenu(container, container.querySelector('.nav'), 'Buka menu navigasi');
});

document.querySelectorAll('.admin-sidebar').forEach((container) => {
  setupMobileMenu(container, container.querySelector('.admin-nav'), 'Buka menu admin', { persistScroll: true });

  const layout = container.closest('.admin-layout');
  const header = layout?.querySelector('.admin-main .admin-header');
  if (!layout || !header) return;

  container.id ||= 'adminSidebar';
  const button = document.createElement('button');
  button.className = 'admin-sidebar-toggle';
  button.type = 'button';
  button.setAttribute('aria-controls', container.id);
  button.innerHTML = '<span></span><span></span><span></span>';
  header.prepend(button);

  const storageKey = 'drivelink-admin-sidebar-collapsed';
  const setCollapsed = (collapsed) => {
    layout.classList.toggle('admin-sidebar-collapsed', collapsed);
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', collapsed ? 'Tampilkan sidebar' : 'Sembunyikan sidebar');
    button.title = collapsed ? 'Tampilkan sidebar' : 'Sembunyikan sidebar';
  };

  setCollapsed(localStorage.getItem(storageKey) === 'true');
  button.addEventListener('click', () => {
    const collapsed = !layout.classList.contains('admin-sidebar-collapsed');
    localStorage.setItem(storageKey, String(collapsed));
    setCollapsed(collapsed);
  });
});
