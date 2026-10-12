const reviewForm = document.getElementById('customerReviewForm');
const reviewList = document.getElementById('customerReviewList');
const reviewMessage = document.getElementById('customerReviewMessage');
const googleReviewLink = document.getElementById('googleReviewLink');
const reviewCount = document.getElementById('reviewCount');
const reviewAverage = document.getElementById('reviewAverage');

function renderReviews(reviews) {
  reviewList.replaceChildren();
  reviewCount.textContent = `${reviews.length} penilaian`;
  if (!reviews.length) {
    reviewAverage.textContent = 'Belum ada penilaian';
    const empty = document.createElement('p');
    empty.className = 'customer-review-empty';
    empty.textContent = 'Belum ada ulasan. Jadilah pelanggan pertama yang berbagi pengalaman.';
    reviewList.append(empty);
    return;
  }
  const average = reviews.reduce((total, review) => total + review.rating, 0) / reviews.length;
  reviewAverage.textContent = `${average.toFixed(1)} / 5 (${reviews.length})`;
  reviews.forEach((review) => {
    const card = document.createElement('article');
    card.className = 'customer-review-card';
    const heading = document.createElement('div');
    heading.className = 'customer-review-card-heading';
    const author = document.createElement('strong');
    author.textContent = review.name;
    const date = document.createElement('time');
    date.dateTime = review.createdAt;
    date.textContent = new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
    }).format(new Date(review.createdAt));
    heading.append(author, date);
    const stars = document.createElement('span');
    stars.className = 'customer-review-stars';
    stars.setAttribute('aria-label', `${review.rating} dari 5 bintang`);
    stars.textContent = `${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}`;
    const comment = document.createElement('p');
    comment.textContent = review.comment;
    card.append(heading, stars, comment);
    reviewList.append(card);
  });
}

async function loadReviews() {
  try {
    const [reviews, reviewLink] = await Promise.all([
      DriveLinkAPI.get('/api/reviews'),
      DriveLinkAPI.get('/api/site-settings/review-link'),
    ]);
    renderReviews(reviews);
    if (reviewLink.reviewUrl) {
      googleReviewLink.href = reviewLink.reviewUrl;
      googleReviewLink.hidden = false;
      document.getElementById('googleReviewNote').textContent =
        'Penilaian website dan Google Maps dikirim secara terpisah.';
    }
  } catch (error) {
    reviewCount.textContent = 'Penilaian gagal dimuat';
    reviewAverage.textContent = 'Tidak tersedia';
    const failure = document.createElement('p');
    failure.className = 'customer-review-empty is-error';
    failure.textContent = `Penilaian gagal dimuat dari server: ${error.message}`;
    reviewList.replaceChildren(failure);
  }
}

reviewForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(reviewForm);
  const submitButton = reviewForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  reviewMessage.textContent = 'Mengirim penilaian…';
  reviewMessage.classList.remove('is-error');
  try {
    const review = await DriveLinkAPI.post('/api/reviews', {
      name: String(form.get('name') || ''),
      rating: Number(form.get('rating')),
      comment: String(form.get('comment') || ''),
    });
    reviewForm.reset();
    const current = await DriveLinkAPI.get('/api/reviews');
    renderReviews(current);
    reviewMessage.textContent = `Terima kasih, ${review.name}. Penilaian Anda sudah ditampilkan.`;
  } catch (error) {
    reviewMessage.textContent = `Penilaian gagal dikirim: ${error.message}`;
    reviewMessage.classList.add('is-error');
  } finally {
    submitButton.disabled = false;
  }
});

loadReviews();
