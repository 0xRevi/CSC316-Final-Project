class TimeController {
    constructor(data) {
        this.data = data;
        this.currentIndex = 0;
        this.isPlaying = false;
        this.duration = 180; // ms per frame

        this.currentAudio = null;
        this.currentTopTrackID = null;
        this.audioPositions = {}; // keep track of playback positions

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
        this.updateTopSong();
    }

    updateTopSong() {
        const topTrackID = this.data[this.currentIndex].songs[0].id;
        if (this.currentTopTrackID == topTrackID) return;

        // save current position before switching
        if (this.currentAudio && this.currentTopTrackID) {
            this.audioPositions[this.currentTopTrackID] =
                this.currentAudio.currentTime;
        }

        this.currentTopTrackID = topTrackID;

        // stop current audio if playing
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }

        const audioPath = `../data/song_preview/${topTrackID}.m4a`;

        this.currentAudio = new Audio(audioPath);
        this.currentAudio.volume = 0.3;
        this.currentAudio.loop = true;

        // set the current time to the saved position if available
        if (this.audioPositions[topTrackID] !== undefined) {
            this.currentAudio.currentTime = this.audioPositions[topTrackID];
        }

        // add error handling for the audio element
        this.currentAudio.onerror = (e) => {
            console.error("Audio error:", e);
        };

        if (this.isPlaying) {
            const playPromise = this.currentAudio.play();

            if (playPromise !== undefined) {
                playPromise.catch((error) => {
                    // Don't throw additional errors
                });
            }
        }
    }

    togglePlayPause() {
        this.isPlaying = !this.isPlaying;
        if (this.isPlaying && this.currentIndex >= this.data.length - 1) {
            this.currentIndex = 0;
        }

        if (this.isPlaying) {
            if (this.playButton.classed("breathing")) {
                // fade out the large button
                this.playButton
                    .transition()
                    .duration(300)
                    .style("opacity", 0)
                    .on("end", () => {
                        // after fade out, pop in the small button
                        // check if play button has class "breathing"
                        this.playButton
                            .classed("breathing", false)
                            .style("top", "30px")
                            .style("left", "calc(100% - 60px)")
                            .style("transform", "scale(0)")
                            .style("opacity", 1)
                            .transition()
                            .duration(400)
                            .style("transform", "scale(1)");
                    });
            }

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

        if (this.currentAudio) {
            const playPromise = this.currentAudio.play();

            if (playPromise !== undefined) {
                playPromise.catch((error) => {
                    console.log("Playback error handled:", error);
                });
            }
        }

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
        if (this.currentAudio) {
            this.currentAudio.pause();
        }

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
