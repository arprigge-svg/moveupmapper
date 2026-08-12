(function () {
  var dropdowns = document.querySelectorAll('.nav-dropdown');
  if (!dropdowns.length) return;

  dropdowns.forEach(function (dropdown) {
    var btn = dropdown.querySelector('.nav-dropdown-btn');
    if (!btn) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var wasOpen = dropdown.classList.contains('open');
      dropdowns.forEach(function (d) { d.classList.remove('open'); });
      if (!wasOpen) dropdown.classList.add('open');
    });

    // Close when a menu item is tapped
    dropdown.querySelectorAll('.nav-dropdown-item').forEach(function (item) {
      item.addEventListener('click', function () {
        dropdown.classList.remove('open');
      });
    });
  });

  document.addEventListener('click', function () {
    dropdowns.forEach(function (d) { d.classList.remove('open'); });
  });
}());
