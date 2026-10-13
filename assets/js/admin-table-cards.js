// Menempelkan nama kolom ke setiap sel tabel admin sebagai data-label.
//
// Dipakai oleh assets/css/admin-table-cards.css agar tabel lebar (mis.
// Reservasi dengan 17 kolom) berubah menjadi kartu di layar HP.
// Di layar lebar modul ini tidak mengubah apa pun.
(() => {
  const labelTables = (root) => {
    const tables = root.querySelectorAll
      ? [...root.querySelectorAll('.admin-table')]
      : [];
    if (root.matches?.('.admin-table')) tables.unshift(root);
    tables.forEach((table) => {
      const headers = [...table.querySelectorAll('thead th')]
        .map((th) => th.textContent.trim());
      if (!headers.length) return;
      table.querySelectorAll('tbody tr').forEach((row) => {
        [...row.children].forEach((cell, index) => {
          if (cell.tagName !== 'TD') return;
          if (headers[index]) cell.dataset.label = headers[index];
        });
      });
    });
  };

  // Sel kedatangan pada halaman Reservasi diisi modul admin-reservations.js.
  // Setelah tabel digambar ulang, timer perlu dihitung ulang.
  const refreshArrivalTimers = () => {
    if (typeof window.updateArrivalTimers === 'function') window.updateArrivalTimers();
  };

  labelTables(document);
  document.addEventListener('DOMContentLoaded', () => labelTables(document));
  window.addEventListener('load', () => labelTables(document));
  window.DriveLinkSessionReady?.then(() => {
    labelTables(document);
    refreshArrivalTimers();
  });

  // Tabel admin terisi setelah data server tiba, jadi label perlu diulang.
  if (window.MutationObserver) {
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        labelTables(document);
      });
    };
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();