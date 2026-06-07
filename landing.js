(function () {
  'use strict';

  const root = document.documentElement;
  const THEME_KEY = 'ps-theme';

  function getTheme() {
    return root.getAttribute('data-theme') || 'dark';
  }

  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }

  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) root.setAttribute('data-theme', saved);
  } catch (e) {}

  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    });
  }

  var nav = document.getElementById('nav');
  function onScroll() {
    if (window.scrollY > 12) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = document.getElementById(btn.getAttribute('data-copy'));
      if (!target) return;
      try {
        navigator.clipboard.writeText(target.innerText).then(function () {
          var label = btn.querySelector('.copy-label');
          if (label) {
            var prev = label.textContent;
            label.textContent = 'Copied!';
            setTimeout(function () { label.textContent = prev; }, 1400);
          }
        });
      } catch (e) {}
    });
  });
})();
