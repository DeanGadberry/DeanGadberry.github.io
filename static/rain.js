// Shared "falling" background effect: photos on the homepage, book
// covers on the books page. Hovering a drop pauses its fall, zooms it
// up, and nudges nearby drops out of the way.
(function () {
    function initRain(opts) {
        var container = document.getElementById(opts.containerId);
        if (!container) return;
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return;
        }

        var images = opts.images;
        var count = opts.count || images.length * 2;
        var minSize = opts.minSize || 70;
        var maxSize = opts.maxSize || 130;
        var minDur = opts.minDur || 32;
        var maxDur = opts.maxDur || 60;
        var drops = [];

        function rand(min, max) {
            return min + Math.random() * (max - min);
        }

        function shuffled(arr) {
            var a = arr.slice();
            for (var i = a.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
            }
            return a;
        }

        // Draw without repeats until the whole set has been used once,
        // then reshuffle - so with count <= images.length every photo
        // gets used, and duplicates only appear once the pool is spent.
        var pool = [];
        function nextImage() {
            if (pool.length === 0) pool = shuffled(images);
            return pool.pop();
        }

        for (var i = 0; i < count; i++) {
            var src = nextImage();
            var drop = document.createElement('div');
            drop.className = 'drop';
            var size = rand(minSize, maxSize);
            var dur = rand(minDur, maxDur);
            var delay = -rand(0, dur);
            var rot = rand(-10, 10);
            var left = rand(-2, 96);
            drop.style.setProperty('--left', left + '%');
            drop.style.setProperty('--size', size + 'px');
            drop.style.setProperty('--dur', dur + 's');
            drop.style.setProperty('--delay', delay + 's');
            drop.style.setProperty('--rot', rot + 'deg');

            var push = document.createElement('div');
            push.className = 'drop-push';
            var img = document.createElement('img');
            img.className = 'drop-img';
            img.src = src;
            img.alt = '';
            img.loading = 'lazy';
            push.appendChild(img);
            drop.appendChild(push);
            container.appendChild(drop);
            drops.push(drop);
        }

        var pushed = [];

        function activate(drop) {
            drop.classList.add('hovered');
            var rect = drop.getBoundingClientRect();
            var cx = rect.left + rect.width / 2;
            var cy = rect.top + rect.height / 2;
            var threshold = Math.max(rect.width, rect.height) * 1.8;

            drops.forEach(function (other) {
                if (other === drop) return;
                var r2 = other.getBoundingClientRect();
                var ox = r2.left + r2.width / 2;
                var oy = r2.top + r2.height / 2;
                var dx = ox - cx;
                var dy = oy - cy;
                var dist = Math.hypot(dx, dy) || 1;
                if (dist < threshold) {
                    var strength = (threshold - dist) / threshold;
                    var nx = dx / dist;
                    var ny = dy / dist;
                    var pushDist = 55 * strength;
                    var el = other.querySelector('.drop-push');
                    el.style.transform = 'translate(' + (nx * pushDist).toFixed(1) + 'px,' + (ny * pushDist).toFixed(1) + 'px)';
                    other.classList.add('pushed');
                    pushed.push(other);
                }
            });
        }

        function deactivate(drop) {
            drop.classList.remove('hovered');
            pushed.forEach(function (other) {
                other.classList.remove('pushed');
                other.querySelector('.drop-push').style.transform = '';
            });
            pushed = [];
        }

        container.addEventListener('pointerover', function (e) {
            var d = e.target.closest && e.target.closest('.drop');
            if (d) activate(d);
        });
        container.addEventListener('pointerout', function (e) {
            var d = e.target.closest && e.target.closest('.drop');
            if (d && (!e.relatedTarget || !d.contains(e.relatedTarget))) deactivate(d);
        });
    }

    window.initRain = initRain;
})();
