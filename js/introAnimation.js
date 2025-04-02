// introAnimation.js
function initIntroAnimation() {

    const container = document.getElementById("floating-images");
    if (container.childElementCount > 0) return;

    const strokeWidth = 4;

    // Lists for solo and collab images
    const soloImages = [
        "taylor-swift.png",
        "billie-eilish.png",
        "bad-bunny.png",
        "jennie.png",
        "sza.png"
    ];
    const collabImages = [
        "the-weeknd.png",
        "bruno-mars.png",
        "drake.png",
        "ed-sheeran.png",
        "justin-bieber.png",
        "lady-gaga.png",
        "post-malone.png",
        "travis-scott.png"
    ];
    // List of all image filenames
    const imageFilenames = [
        "taylor-swift.png",
        "billie-eilish.png",
        "the-weeknd.png",
        "bruno-mars.png",
        "bad-bunny.png",
        "drake.png",
        "ed-sheeran.png",
        "jennie.png",
        "justin-bieber.png",
        "lady-gaga.png",
        "post-malone.png",
        "sza.png",
        "travis-scott.png"
    ];

    // Container elements
    const parent = document.getElementById("intro");

    // Array to store image elements and their velocities for animation
    const floatingImages = [];

    const maxWidth = window.innerWidth;
    const maxHeight = window.innerHeight;

    // Helper function to check if a new position would overlap existing images
    function isOverlapping(x, y, existingImages) {
        for (const item of existingImages) {
            const otherX = parseFloat(item.el.style.left);
            const otherY = parseFloat(item.el.style.top);
            if (Math.abs(x - otherX) < 100 && Math.abs(y - otherY) < 100) {
                return true;
            }
        }
        return false;
    }

    // Pre-render the stroke effect using repeated offset drawing
    function createStrokedImage(imageSrc, strokeColor, strokeWidth, callback) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = function() {
            const canvas = document.createElement("canvas");
            canvas.width = img.width + 2 * strokeWidth;
            canvas.height = img.height + 2 * strokeWidth;
            const ctx = canvas.getContext("2d");

            // Draw the image multiple times around the center
            for (let dx = -strokeWidth; dx <= strokeWidth; dx++) {
                for (let dy = -strokeWidth; dy <= strokeWidth; dy++) {
                    ctx.drawImage(img, strokeWidth + dx, strokeWidth + dy);
                }
            }
            ctx.globalCompositeOperation = "source-in";
            ctx.fillStyle = strokeColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = "source-over";
            ctx.drawImage(img, strokeWidth, strokeWidth);

            callback(canvas);
        };
        img.src = imageSrc;
    }

    // Process each image filename and pre-render its stroke effect
    imageFilenames.forEach(filename => {
        let strokeColor = null;
        if (soloImages.includes(filename)) {
            strokeColor = window.SOLO_COLOR;
        } else if (collabImages.includes(filename)) {
            strokeColor = window.COLLAB_COLOR;
        }
        const imgSrc = `img/intro_pics/${filename}`;

        if (strokeColor) {
            createStrokedImage(imgSrc, strokeColor, strokeWidth, (canvas) => {
                const preRenderedImg = new Image();
                preRenderedImg.src = canvas.toDataURL();
                preRenderedImg.style.position = "absolute";

                let posX, posY, attempts = 0;
                do {
                    posX = Math.random() * (maxWidth - 100);
                    posY = Math.random() * (maxHeight - 100);
                    attempts++;
                } while (isOverlapping(posX, posY, floatingImages) && attempts < 100);
                preRenderedImg.style.left = posX + "px";
                preRenderedImg.style.top = posY + "px";

                preRenderedImg.addEventListener("mouseover", () => {
                    preRenderedImg.style.transform = "scale(1.2)";
                });
                preRenderedImg.addEventListener("mouseout", () => {
                    preRenderedImg.style.transform = "scale(1)";
                });

                container.appendChild(preRenderedImg);
                floatingImages.push({
                    el: preRenderedImg,
                    vx: (Math.random() - 0.5) * 2,
                    vy: (Math.random() - 0.5) * 2,
                });
            });
        } else {
            const img = new Image();
            img.src = imgSrc;
            img.style.position = "absolute";
            let posX, posY, attempts = 0;
            do {
                posX = Math.random() * (maxWidth - 100);
                posY = Math.random() * (maxHeight - 100);
                attempts++;
            } while (isOverlapping(posX, posY, floatingImages) && attempts < 100);
            img.style.left = posX + "px";
            img.style.top = posY + "px";

            img.addEventListener("mouseover", () => {
                img.style.transform = "scale(1.2)";
            });
            img.addEventListener("mouseout", () => {
                img.style.transform = "scale(1)";
            });

            container.appendChild(img);
            floatingImages.push({
                el: img,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
            });
        }
    });

    // Repulsion effect
    parent.addEventListener("mousemove", (e) => {
        const rect = parent.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const repulsionThreshold = 150;

        floatingImages.forEach(item => {
            const img = item.el;
            const imgCenterX = parseFloat(img.style.left) + img.offsetWidth / 2;
            const imgCenterY = parseFloat(img.style.top) + img.offsetHeight / 2;
            const dx = imgCenterX - mouseX;
            const dy = imgCenterY - mouseY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < repulsionThreshold && distance > 0) {
                const force = (repulsionThreshold - distance) / repulsionThreshold;
                const nx = dx / distance;
                const ny = dy / distance;
                item.vx += nx * force;
                item.vy += ny * force;

                const maxSpeed = 3;
                const speed = Math.sqrt(item.vx * item.vx + item.vy * item.vy);
                if (speed > maxSpeed) {
                    item.vx = (item.vx / speed) * maxSpeed;
                    item.vy = (item.vy / speed) * maxSpeed;
                }
            }
        });
    });

    // Animation loop for movement and collision detection
    function animate() {
        floatingImages.forEach(item => {
            let x = parseFloat(item.el.style.left);
            let y = parseFloat(item.el.style.top);
            x += item.vx;
            y += item.vy;


            // Wrap-around for horizontal movement
            if (x < -item.el.offsetWidth) {
                x = maxWidth;
            } else if (x > maxWidth) {
                x = -item.el.offsetWidth;
            }

            // Wrap-around for vertical movement
            if (y < -item.el.offsetHeight) {
                y = maxHeight;
            } else if (y > maxHeight) {
                y = -item.el.offsetHeight;
            }


            item.el.style.left = x + "px";
            item.el.style.top = y + "px";
        });

        // Collision detection
        for (let i = 0; i < floatingImages.length; i++) {
            for (let j = i + 1; j < floatingImages.length; j++) {
                let img1 = floatingImages[i].el;
                let img2 = floatingImages[j].el;
                let x1 = parseFloat(img1.style.left);
                let y1 = parseFloat(img1.style.top);
                let x2 = parseFloat(img2.style.left);
                let y2 = parseFloat(img2.style.top);
                let w1 = img1.offsetWidth;
                let h1 = img1.offsetHeight;
                let w2 = img2.offsetWidth;
                let h2 = img2.offsetHeight;

                if (x1 < x2 + w2 && x1 + w1 > x2 &&
                    y1 < y2 + h2 && y1 + h1 > y2) {
                    let overlapX = Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2);
                    let overlapY = Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2);

                    if (overlapX < overlapY) {
                        let adjust = overlapX / 2;
                        if (x1 < x2) {
                            x1 -= adjust;
                            x2 += adjust;
                        } else {
                            x1 += adjust;
                            x2 -= adjust;
                        }
                    } else {
                        let adjust = overlapY / 2;
                        if (y1 < y2) {
                            y1 -= adjust;
                            y2 += adjust;
                        } else {
                            y1 += adjust;
                            y2 -= adjust;
                        }
                    }
                    x1 = Math.max(0, Math.min(x1, maxWidth - w1));
                    y1 = Math.max(0, Math.min(y1, maxHeight - h1));
                    x2 = Math.max(0, Math.min(x2, maxWidth - w2));
                    y2 = Math.max(0, Math.min(y2, maxHeight - h2));

                    img1.style.left = x1 + "px";
                    img1.style.top = y1 + "px";
                    img2.style.left = x2 + "px";
                    img2.style.top = y2 + "px";
                }
            }
        }
        requestAnimationFrame(animate);
    }
    animate();
}
