class TimeController {
    constructor(data) {
        this.data = data;
        this.currentIndex = 0;
        this.isPlaying = false;
        this.duration = 100; // ms per frame

        this.init();
    }

    init() {
        // initialize visualizations
        this.barChart = new BarChartRace("bar-chart-race-container", this.data);
        this.timeline = new LineChartTimeline("timeline-container", this.data);

        // create play button
        this.playButton = d3
            .select("#control-container")
            .append("button")
            .attr("class", "play-pause-btn paused")
            .html('<i class="bi bi-play-fill"></i>')
            .on("click", () => this.togglePlayPause());

        // handle interactive behavior on timeline
        let dragBehavior = d3.drag().on("start drag", (event) => {
            const xPos = d3.pointer(event, this.timeline.svg.node())[0] - 20;
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
        this.isPlaying ? this.play() : this.pause();
    }

    play() {
        this.playButton
            .html('<i class="bi bi-pause-fill"></i>')
            .classed("playing", true)
            .classed("paused", false);

        this.interval = setInterval(() => {
            if (this.currentIndex < this.data.length - 1) {
                this.currentIndex += 1;
                this.updateVisualizations();
            } else {
                this.pause();
                this.isPlaying = false;
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
}
