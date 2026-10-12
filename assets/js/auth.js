document.getElementById('loginForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const username = String(data.get('username')).trim();
  const password = String(data.get('password'));
  const message = document.getElementById('loginMessage');

  DriveLinkAPI.post('/api/auth/login', { username, password })
    .then(async (session) => {
      DriveLinkStorage.write('drivelink-session', session);
      message.classList.remove('is-error');
      const destinations = {
        overview: 'admin.html',
        bookings: 'admin-reservations.html',
        fleet: 'admin-fleet.html',
        'vehicle-service': 'admin-vehicle-service.html',
        location: 'admin-location.html',
        'rental-settings': 'admin-rental-settings.html',
        'travel-packages': 'admin-travel-packages.html',
        monitoring: 'admin-monitoring.html',
        payments: 'admin-payments.html',
        handover: 'admin-handover.html',
      };
      if (session.role !== 'admin' && !session.permissions.some((permission) => destinations[permission])) {
        await DriveLinkAPI.post('/api/auth/logout', {});
        message.textContent = 'Akun ini belum diberi akses ke fitur dashboard. Hubungi administrator.';
        message.classList.add('is-error');
        return;
      }
      window.location.href = session.role === 'admin'
        ? 'admin.html'
        : destinations[session.permissions.find((permission) => destinations[permission])] || 'auth.html';
    })
    .catch((error) => {
      message.textContent = error.message;
      message.classList.add('is-error');
    });
});
