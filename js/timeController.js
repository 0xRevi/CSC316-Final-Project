class TimeController {
    constructor(data) {
        this.data = data;
        this.currentIndex = 0;
        this.isPlaying = false;
        this.duration = 120; // ms per frame

        this.init();
    }

    init() {
        // initialize visualizations
        this.barChart = new BarChartRace("bar-chart-race-container", this.data);
        this.timeline = new LineChartTimeline("timeline-container", this.data);

        this.overlay = d3
            .select("#visualization-container")
            .append("div")
            .attr("class", "chart-overlay")
            .style("opacity", 0.7);

        // create play button
        this.playButton = d3
            .select("#bar-chart-race-container")
            .append("button")
            .attr("class", "play-pause-btn paused breathing")
            .style("position", "absolute")
            .style("top", "50%")
            .style("left", "50%")
            .style("transform", "translate(-50%, -50%)")
            .html('<i class="bi bi-play-fill"></i>')
            .on("click", () => this.togglePlayPause());

        // handle interactive behavior on timeline
        let dragBehavior = d3.drag().on("start drag", (event) => {
            const xPos = d3.pointer(event, this.timeline.svg.node())[0];
            const date = this.timeline.xScale.invert(xPos);
            const index = d3
                .bisector((d) => new Date(d.date))
                .left(this.data, date);

            const boundedIndex = Math.max(
                0,
                Math.min(this.data.length - 1, index)
            );
            this.currentIndex = boundedIndex;
            this.updateVisualizations();

            // hide tooltip after user drags
            this.timeline.hideDragTooltip();
        });

        // add drag behavior to timeline
        this.timeline.svg.style("cursor", "grab").call(dragBehavior);
    }

    updateVisualizations() {
        this.barChart.wrangleData(this.currentIndex);
        this.timeline.wrangleData(this.currentIndex);
    }

    togglePlayPause() {
        this.isPlaying = !this.isPlaying;
        if (this.isPlaying && this.currentIndex >= this.data.length - 1) {
            this.currentIndex = 0;
        }

        if (this.isPlaying) {
            this.playButton
                .classed("breathing", false)
                .style("transform", "none")
                .transition()
                .duration(400)
                .style("top", "30px")
                .style("left", "calc(100% - 60px)");

            this.overlay
                .transition()
                .duration(800)
                .style("opacity", 0)
                .on("end", () => {
                    this.overlay.style("display", "none");
                });

            this.play();
        } else {
            this.pause();
        }
    }

    play() {
        this.playButton
            .html('<i class="bi bi-pause-fill"></i>')
            .classed("playing", true)
            .classed("paused", false);

        // show tooltip after play is pressed
        this.timeline.showDragTooltip();

        this.interval = setInterval(() => {
            if (this.currentIndex < this.data.length - 1) {
                this.currentIndex += 1;
                this.updateVisualizations();
            } else {
                this.pause();
                this.isPlaying = false;
                // hide tooltip when animation completes
                this.timeline.hideDragTooltip();
            }
        }, this.duration);
    }

    pause() {
        clearInterval(this.interval);
        this.playButton
            .html('<i class="bi bi-play-fill"></i>')
            .classed("playing", false)
            .classed("paused", true);
    }

    handlePageLeave() {
        if (this.isPlaying) {
            this.pause();
            this.isPlaying = false;
        }
        // Always hide tooltip when leaving the page
        if (this.timeline) {
            this.timeline.hideDragTooltip(false);
        }
    }
}
