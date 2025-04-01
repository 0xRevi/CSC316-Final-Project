class ArtistNetworkGraph {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.currentYear = null;
    this.dataCache = {};

    // Artist images for mapping
    this.artistImagesMapping = {};

    this.currentArtist = null;         // Currently selected artist
    this.instructionsDismissed = false;  // Whether the user has dismissed the instructions
    this.isInstructionView = false;      // Whether the instructions panel is currently open

    // Simulate nodes and positions
    this.simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(d => d.artist_id).distance(50))
        .force("charge", d3.forceManyBody().strength(-50))
        .force("center", d3.forceCenter(this.width / 2, this.height / 2))
        .force("collide", d3.forceCollide().radius(30));

    // Color scale for collaboration gradient
    this.reverseGreenScale = d3.scaleSequential(t => d3.interpolateRgb("#1a2e1a", window.COLLAB_COLOR)(t))
      .domain([0, 1]);



    // Graph state configuration
    this.state = {
      svg: null,
      graphGroup: null,
      width: null,
      height: null,
      zoom: null,
      tooltip: null,
      globalLinks: [],
      globalNodes: [],
      nodeElements: null,
      linkElements: null,
      overlayElements: null,
      labelElements: null,
      globalColorScale: null,
      selectedNode: null,
      songDataMap: {},
      userInteracted: false,
      artistTable: null,
      selectionHistory: [],
      historyIndex: -1,
      radiusScale: null,
      historyByYear: {}
    };

    ["all", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024"].forEach(year => {
      this.state.historyByYear[year] = { history: [], index: -1 };
    });
  }

  hideInfo() {
    d3.select("#overlay").style("display", "none");
    d3.select("#info-panel").style("display", "none");
  }

  showInfo() {
    d3.select("#overlay").style("display", "block");
    d3.select("#info-panel").style("display", "block");
  }

  init() {
    const { svg, graphGroup, width, height } = this.createSVGContainer();
    Object.assign(this.state, { svg, graphGroup, width, height });
    this.state.zoom = this.setupZoom(svg, graphGroup);
    this.state.tooltip = this.createTooltip();

    this.disableFullPageScrolling();
    this.setupUIControls();
    this.showInstructionPanel();
    this.bindSVGBackgroundClick();
    this.loadArtistImages();

    const initialYear = this.options.initialYear || "2024";
    this.loadData(initialYear);
    

  }

  disableFullPageScrolling() {
    this.container.on("mouseenter", () => {
      if (window.fullpage_api) fullpage_api.setAllowScrolling(false);
    }).on("mouseleave", () => {
      if (window.fullpage_api) fullpage_api.setAllowScrolling(true);
    });
  }

  createSVGContainer() {
    // Use user screen dimensions to auto-configure display dimensions
    // Get the title element and the network container
    const titleEl = document.getElementById("top-panel-wrapper");
    const networkContainer = document.getElementById("artist-network-container");

    // Get the title height (in pixels)
    const titleHeight = titleEl.offsetHeight;

    // Calculate available height (viewport height minus title height)
    const availableHeight = window.innerHeight - titleHeight;

    // Set the network container's height dynamically
    networkContainer.style.height = `${availableHeight}px`;

    const containerWidth = networkContainer.clientWidth;
    const containerHeight = networkContainer.clientHeight;
    
    const svg = d3.select(networkContainer)
      .append("svg")
      .attr("id", "main-network-svg") // Add a unique ID here
      .attr("viewBox", `0 0 ${containerWidth} ${containerHeight}`)
      .attr("preserveAspectRatio", "xMidYMid meet")

    svg.node().addEventListener("wheel", event => event.preventDefault(), { passive: false });
    svg.append("rect")
      .attr("width", containerWidth)
      .attr("height", containerHeight)
      .attr("fill", "transparent");
    const graphGroup = svg.append("g")
      .attr("transform", `translate(${containerWidth / 2}, ${containerHeight / 2})`);
    return { svg, graphGroup, width: containerWidth, height: containerHeight };
  }

  setupZoom(svg, graphGroup) {
    const zoom = d3.zoom()
      .scaleExtent([0.1, 3])
      .translateExtent([[-Infinity, -Infinity], [Infinity, Infinity]])
      .constrain(transform => transform)
      .on("zoom", event => {
        graphGroup.attr("transform", event.transform);
        this.state.currentZoomScale = event.transform.k; // Save the current zoom scale
      });
      
    svg.call(zoom);
    zoom.on("start", () => { this.state.userInteracted = true; });
    return zoom;
  }

  createTooltip() {
    // Check if a tooltip already exists in the body
    // Resolves creating multiple tooltips after page revisit events.
    let tooltip = d3.select("body").select("div.network-tooltip");
    if (!tooltip.empty()) {
      return tooltip;
    }
    // Otherwise, create a new one
    return d3.select("body")
      .append("div")
      .attr("class", "network-tooltip")
  }

  loadData(year) {
    if (this.currentYear === year) {
        console.log("Year is already populated.");
        return;
    }
    this.currentYear = year;
    if (!this.state.historyByYear[year]) {
        this.state.historyByYear[year] = { history: [], index: -1 };
    }
    const startOverall = performance.now();

    if (this.dataCache[year]) {
        console.log(`Using cached data for year ${year}`);
        const { nodes, links, radiusScale, colorScale, artistInfo } = this.dataCache[year];
        this.finalizeDataLoad(nodes, links, radiusScale, colorScale, artistInfo, startOverall);
        this.restoreHistoryForYear(year);
        // Always rebind current history after loading
        // Always rebind current history after loading
        const currentHistory = this.state.historyByYear[year];
        this.state.selectionHistory = currentHistory.history;
        this.state.historyIndex = currentHistory.index;

        return;
    }

    // Conditionally load the correct network CSV and artist-level JSON
    const networkFile = (year === "all")
        ? `data/artist_network/global-artist_network-all.csv`
        : `data/artist_network/global-artist_network-${year}.csv`;

    const artistJSONFile = (year === "all")
        ? `data/artist_level_informaiton/artist_level-all.json`
        : `data/artist_level_informaiton/artist_level-${year}.json`;

    // Load the filtered datasets
    Promise.all([
        d3.dsv(",", networkFile),
        d3.json(artistJSONFile)
    ]).then(([networkData, artistInfo]) => {
      console.log("Network Data Loaded:", networkData);
      console.log("Artist JSON Loaded:", artistInfo);
      const { nodes, links, radiusScale, colorScale } = this.processData(networkData, artistInfo);

      // Cache processed data
      this.dataCache[year] = { nodes, links, radiusScale, colorScale, artistInfo };
      this.finalizeDataLoad(nodes, links, radiusScale, colorScale, artistInfo, startOverall);
      this.restoreHistoryForYear(year);

    }).catch(error => {
        console.error("Error loading data:", error);
    });
  }

  finalizeDataLoad(nodes, links, radiusScale, colorScale, artistInfo, startOverall) {
    Object.assign(this.state, {
        globalLinks: links,
        globalNodes: nodes,
        globalColorScale: colorScale,
        artistInfo: artistInfo
    });

    // Get max collaborators for color gradient
    this.state.maxCollaborators = d3.max(this.state.globalNodes, d => d.collaborators.collaborator_count);


    // Node sizing scale
    const totalStreamExtent = d3.extent(nodes, d => d.total_streams);
    this.state.totalStreamRadiusScale = d3.scaleSqrt()
        .domain(totalStreamExtent)
        .range([8, 30]);

    // Clear and render graph
    this.state.graphGroup.selectAll("*").remove();
    this.createGraph(nodes, links, radiusScale, colorScale);
    console.log(`Total render time for ${this.currentYear}: ${performance.now() - startOverall} ms`);
    this.applyTopKFilter();
  }

  processData(networkData, artistInfo) {
    const nodesMap = {};

    Object.entries(artistInfo).forEach(([artistId, info]) => {
        nodesMap[artistId] = {
            id: artistId,
            artist_name: info.artist_name,
            total_streams: info.total_streams,
            solo_songs: info.solo_songs,
            collab_songs: info.collab_songs,
            solo_song_count: info.solo_song_count,
            collab_song_count: info.collab_song_count,
            top_200_songs: info.top_200_songs,
            is_solo_artist: info.is_solo_artist,
            is_most_streamed_solo_artist: info.is_most_streamed_solo_artist,
            is_most_streamed_collab_artist: info.is_most_streamed_collab_artist,
            is_artist_with_most_collaborations: info.is_artist_with_most_collaborations,
            total_stream_rank: info.total_stream_rank,
            collaborators: info.collaborators,
            degree: 0 // placeholder but will be populated
        };
        // Adding remaining variables specific to all years artist network.
        if (this.currentYear === "all" && info.years_on_chart) {
          nodesMap[artistId].years_on_chart = info.years_on_chart;
        }
    });

    const links = networkData
    .filter(d => d.artist_2_id && d.artist_2_id.trim() !== "")
    .map(d => {
        const sourceId = d.artist_1_id;
        const targetId = d.artist_2_id;

        // Defensive: only increment degrees if nodes exist
        if (nodesMap[sourceId]) nodesMap[sourceId].degree += 1;
        if (nodesMap[targetId]) nodesMap[targetId].degree += 1;

        return {
            source: sourceId,
            target: targetId,
            song_ids: JSON.parse(d.song_ids.replace(/'/g, '"')),
            count: +d.count
        };
    });


    const nodes = Object.values(nodesMap);

    // Total streams scale for sizing
    const radiusScale = d3.scaleSqrt()
        .domain(d3.extent(nodes, d => d.total_streams || 1))
        .range([8, 30]);

    const colorScale = d3.scaleOrdinal()
        .domain([0, 1])
        .range(["#888", "#1f77b4"]);

    return { nodes, links, radiusScale, colorScale };
  }

  loadArtistImages() {
    d3.csv("img/artist_network/artist_images.csv").then(data => {
      // Build a mapping with keys as lowercased artist_id and artist_name.
      data.forEach(d => {
        if (d.artist_id && d.image_url) {
          this.artistImagesMapping[d.artist_id.toLowerCase()] = d.image_url;
        }
        if (d.artist_name && d.image_url) {
          this.artistImagesMapping[d.artist_name.toLowerCase()] = d.image_url;
        }
      });
    }).catch(error => {
      console.error("Error loading artist images:", error);
    });
  }

  createGraph(nodes, links, radiusScale, colorScale) {
    const { width, graphGroup, tooltip } = this.state;

    const maxLinkValue = d3.max(links, d => d.count);
    const strokeScale = d3.scaleLinear().domain([0, maxLinkValue]).range([1, 5]).clamp(true);
    this.state.userInteracted = false;

    // Compute positions if not already present
    if (!nodes[0].x) {
        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).strength(d => d.count * 0.1))
            .force("radial", d3.forceRadial(Math.min(width, this.state.height) / 4, width / 2, this.state.height / 2).strength(0.3))
            .force("charge", d3.forceManyBody().strength(-1000))
            .force("center", d3.forceCenter(width / 2, this.state.height / 2))
            .force("x", d3.forceX(width / 2).strength(0.05))
            .force("y", d3.forceY(this.state.height / 2).strength(0.05))
            .force("collide", d3.forceCollide(d => this.state.totalStreamRadiusScale(d.total_streams) + 10).iterations(2))
            .alphaDecay(0.08)
            .alphaMin(0.02)
            .on("end", () => {
                this.labelSpecialArtists();
            });
        simulation.stop();
        for (let i = 0; i < 100; i++) simulation.tick();
    }

    // Render links
    this.state.linkElements = graphGroup.append("g")
        .selectAll("line")
        .data(links)
        .enter().append("line")
        .attr("stroke", "#aaa")
        .attr("stroke-width", d => strokeScale(d.count))
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y)
        .style("opacity", 0);

    // Render nodes
    this.state.nodeElements = graphGroup.append("g")
        .selectAll("circle")
        .data(nodes)
        .enter().append("circle")
        .attr("r", d => this.state.totalStreamRadiusScale(d.total_streams))
        // Graident-styling in greesn
        .style("fill", d => {
          if (d.is_solo_artist) {
              d.baseColor = window.SOLO_COLOR;
          } else {
              const t = d.collaborators.collaborator_count / this.state.maxCollaborators;
              d.baseColor = this.reverseGreenScale(Math.min(1, t));
          }
          return d.baseColor;
        })
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .style("opacity", 0)
        .on("mouseover", (event, d) => {
            tooltip.transition().duration(200).style("opacity", 0.9);
            tooltip.html(`
              <div class="network-tooltip-header">
                  ${d.artist_name} <span class="network-tooltip-rank">#${d.total_stream_rank}</span>
              </div>
              <div class="network-tooltip-row">
                  <span class="network-tooltip-label">Top 200 Songs:</span> ${d.top_200_songs}
                  (${d.solo_song_count} solo / ${d.collab_song_count} collab)
              </div>
              <div class="network-tooltip-row">
                  <span class="network-tooltip-label">Unique Collaborators:</span> ${d.collaborators.collaborator_count}
              </div>
            `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", () => tooltip.transition().duration(200).style("opacity", 0))
        .on("click", (event, d) => {
            event.stopPropagation();
            this.state.graphGroup.select(".special-highlights").style("display", "none");
            this.state.userInteracted = true;
            this.highlightNeighbors(d);
        });

    this.state.nodeElements.transition().duration(800).style("opacity", 1);

    // Overlay (optional)
    this.state.overlayElements = graphGroup.append("g")
        .selectAll("circle")
        .data(nodes)
        .enter().append("circle")
        .attr("class", "overlay")
        .attr("r", d => this.state.totalStreamRadiusScale(d.total_streams) + 4)
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);

    // Optional
    this.fitGraphToSVG();
    this.labelSpecialArtists();
  }



  highlightNeighbors(selected) {
    this.state.selectedNode = selected;
    this.pushToHistory(selected, "node_click");

    // Determine connected nodes
    const connectedNodes = new Set([selected.id]);
    this.state.globalLinks.forEach(link => {
      const sourceID = typeof link.source === "object" ? link.source.id : link.source;
      const targetID = typeof link.target === "object" ? link.target.id : link.target;
      if (sourceID === selected.id || targetID === selected.id) {
        connectedNodes.add(sourceID);
        connectedNodes.add(targetID);
      }
    });

    // Highlight edges within the connected network
    this.state.linkElements
      .style("opacity", d => {
        const sourceID = typeof d.source === "object" ? d.source.id : d.source;
        const targetID = typeof d.target === "object" ? d.target.id : d.target;
        return (sourceID === selected.id || targetID === selected.id) ? 1 : 0;
      })
      .attr("stroke", d => {
        const sourceID = typeof d.source === "object" ? d.source.id : d.source;
        const targetID = typeof d.target === "object" ? d.target.id : d.target;
        return (connectedNodes.has(sourceID) && connectedNodes.has(targetID))
          // Color the nodes in a grey-ish shade to not contrast the white
          ? "#555"
          : "#aaa";
      });

    // Highlight connected nodes and fade out others
    this.state.nodeElements
      .style("opacity", d => connectedNodes.has(d.id) ? 1 : 0.1)
      .style("fill", d => {
        if (d.id === selected.id) {
            return window.SELECTED_NODE_COLOR;
        } else {
            return d.baseColor;
        }
      });

    // Update dynamic labels for connected nodes
    this.state.graphGroup.select(".dynamic-labels").remove();
    this.state.graphGroup.append("g")
        .attr("class", "dynamic-labels")
        .selectAll("text")
        .data(this.state.globalNodes.filter(d => connectedNodes.has(d.id)))
        .enter().append("text")
        .attr("class", "artist-label")
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .attr("dx", d => this.state.totalStreamRadiusScale(d.total_streams) + 4)
        .attr("dy", "0.35em")
        .text(d => d.artist_name)
        .style("fill-opacity", 0.5)
        .style("pointer-events", "none");
    this.updateInfoPanel(selected);
    this.zoomToNodeAndNeighbors(connectedNodes);
  }

  resetVisualization() {
    this.state.selectedNode = null;
    this.currentArtist = null;
    
    this.state.nodeElements
      .transition().duration(500)
      .style("fill", d => d.baseColor)
      .style("opacity", 1);

    this.state.linkElements
      .style("opacity", 0)
      .style("pointer-events", "none")
      .attr("stroke", "#aaa");
    
    this.state.graphGroup.select(".dynamic-labels").remove();
    this.clearInfoPanel();
    
    // Reset the toggle icon to show instructions mode.
    this.isInstructionView = false;
    this.showInstructionToggleIcon();
    
    // Force the zoom reset to default view.
    this.fitGraphToSVG();
    
    this.labelSpecialArtists();
    
  }

  createInstructionLegend(container) {
    // Dimensions for the legend rectangle.
    const legendWidth = 480;
    const legendHeight = 20;
  
    // Overall SVG dimensions (a bit larger than the rectangle to accommodate labels).
    const svgWidth = 480;
    const svgHeight = 60;
  
    // Create an inline SVG in the given container, centered horizontally.
    const legendSvg = container.append("svg")
      .attr("width", svgWidth)
      .attr("height", svgHeight)
      .style("display", "block")
      .style("margin", "0 auto"); // Center the SVG in the container
  
    // Define the linear gradient in <defs>.
    const defs = legendSvg.append("defs");
    const legendGradient = defs.append("linearGradient")
      .attr("id", "instruction-legend-gradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "100%")
      .attr("y2", "0%");
  
    // Example "reverse green" scale from darker to lighter. Adjust if needed.
    legendGradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", this.reverseGreenScale(0));  // Darker: fewer collaborators
  
    legendGradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", this.reverseGreenScale(1));  // Lighter: more collaborators
  
    // Create a group that holds the rectangle and labels,
    // translated so that the legend is horizontally centered in the SVG.
    const legendGroup = legendSvg.append("g")
      // Move the group so it’s centered horizontally & vertically in our 300×60 SVG.
      .attr("transform", `translate(${(svgWidth - legendWidth) / 2}, ${(svgHeight - legendHeight) / 2 + 20})`);
  
    // Draw the gradient rectangle.
    legendGroup.append("rect")
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .style("fill", "url(#instruction-legend-gradient)");
  
    // "Fewer Collaborators" label on the left
    // TODO: Tried to fix this in css styling but couldnt
    legendGroup.append("text")
      .attr("x", 0)
      .attr("y", -5)
      .style("text-anchor", "start")
      .style("fill", "white")
      .style("font-size", "14px")
      .text("Fewer Collaborators");
  
    // "More Collaborators" label on the right
    legendGroup.append("text")
      .attr("x", legendWidth)
      .attr("y", -5)
      .style("text-anchor", "end")
      .style("fill", "white")
      .style("font-size", "14px")
      .text("More Collaborators");
  }

  //! Instruction Panel
  showInstructionPanel() {
    this.isInstructionView = true;
    const panel = d3.select("#info-panel")
      .style("display", "block")
      .classed("instruction-view", true)
      .classed("artist-view", false)
      .attr("tabindex", "0")
      .on("mouseenter", function () { this.focus(); })
      .on("wheel", function (event) { event.stopPropagation(); });
  
    panel.html("");
  
    const instructionWrapper = panel.append("div")
    .attr("class", "instruction-content")
    // Build the instruction content.
    const instructionContent = instructionWrapper.append("div")
      .attr("class", "instruction-body")

    instructionContent.append("h2")
      .text("Welcome to the Artist Network")

      instructionContent
      .append("div")
      .html(`
        <p>
          <strong>How to explore:</strong><br>
          Click on a bubble to view that artist’s details, or use the search bar above to find an artist by name.
        </p>
        <p>
          <strong>Hide this panel:</strong><br>
          Click the minimize button in the top‑right corner if you’d like more space.
        </p>
      `);
    

    const legendContainer = instructionContent.append("div")
      .attr("class", "instruction-legend")

    this.createInstructionLegend(legendContainer);

    panel.append("button")
      .attr("id", "instruction-minimize-btn")
      .classed("nav-button minimize-button", true)
      .html('<i class="fa-solid fa-minus"></i>')
      .on("click", () => this.minimizeInfo());

    // Always ensure the toggle icon is present.
    this.showInstructionToggleIcon();
  }


  showInstructionToggleIcon() {
    let toggleIcon = d3.select("#instruction-toggle-icon");
    const panelHidden = d3.select("#info-panel").style("display") === "none";
  
    // Determine if the NEXT click should open the artist pane
    const nextIsArtist = this.currentArtist && panelHidden;
  
    // Set border‑color class
    toggleIcon
      .classed("artist-mode", nextIsArtist)
      .classed("instructions-mode", !nextIsArtist);

    //! WHAT WE HAD BEFORE BELOW
    if (toggleIcon.empty()) {
      toggleIcon = d3.select("#artist-network-container")
        .append("div")
        .attr("id", "instruction-toggle-icon")
        .classed("instruction-toggle-icon", true);
    }
    
    // Check if the info panel is currently visible.
    const panelDisplay = d3.select("#info-panel").style("display");
    
    if (!this.currentArtist) {
      // No artist selected, only instructions are available.
      // Style the button to show instructions-mode (green).
      toggleIcon.classed("artist-mode", false)
                .classed("instructions-mode", true)
                .html('<i class="fa fa-info" aria-hidden="true"></i>');
    } else {
      // An artist is selected.
      if (panelDisplay === "none") {
        const key = this.currentArtist.id.toLowerCase();
        const imgUrl = this.artistImagesMapping[key] || "img/artist_network/default_artist.png";
        toggleIcon
          .classed("instructions-mode", false)
          .classed("artist-mode", true)
          .html(`<img src="${imgUrl}" alt="${this.currentArtist.id}" />`);
      } else {
        // The panel is visible.
        if (this.isInstructionView) {
          const key = this.currentArtist.id.toLowerCase();
          const imgUrl = this.artistImagesMapping[key] || "img/artist_network/default_artist.png";
          toggleIcon
            .classed("instructions-mode", false)
            .classed("artist-mode", true)
            .html(`<img src="${imgUrl}" alt="${this.currentArtist.id}" />`);
        } else {
          // Artist pane is visible: next click will show instructions.
          // So style the icon to instructions-mode (green).
          toggleIcon.classed("artist-mode", false)
                    .classed("instructions-mode", true)
                    .html('<i class="fa fa-info" aria-hidden="true"></i>');
        }
      }
    }
    // Bind the click event to toggle the view appropriately.
    toggleIcon.on("click", () => {
      const panelDisplay = d3.select("#info-panel").style("display");
      if (!this.currentArtist) {
          // No artist is selected
          if (panelDisplay === "none") {
              // Panel is hidden, show artist
              this.showInstructionPanel();
          } else {
              // Panel is in view, hide it
              d3.select("#info-panel").style("display", "none");
          }
      } else {
          // Artist is selcted
          if (panelDisplay === "none") {
              this.updateInfoPanel(this.currentArtist);
          } else {
              if (this.isInstructionView) {
                  this.updateInfoPanel(this.currentArtist);
              } else {
                  this.showInstructionPanel();
              }
          }
      }
      // Show and update toggle icon
      this.showInstructionToggleIcon();
  });
  
  }

  updateInfoPanel(artist) {
    this.currentArtist = artist;
    this.isInstructionView = false;
    this.instructionsDismissed = true;
  
    const panel = d3.select("#info-panel")
      .classed("instruction-view", true)
      .classed("artist-view", false)
      .style("display", "block")
      .attr("tabindex", "0")
      .on("mouseenter", function() { this.focus(); })
      .on("wheel", event => event.stopPropagation());
  
    panel.html("");
    panel.node().scrollTop = 0;
  
    // Remove any existing navigation buttons
    d3.select("#back-button")?.remove();
    d3.select("#forward-button")?.remove();
  
    // Top-left navigation buttons
    panel.append("button")
      .attr("id", "back-button")
      .classed("nav-button", true)
      .html('<i class="fa-solid fa-arrow-left"></i>')
      .on("click", () => this.goBack());
  
    panel.append("button")
      .attr("id", "forward-button")
      .classed("nav-button", true)
      .html('<i class="fa-solid fa-arrow-right"></i>')
      .on("click", () => this.goForward());
  
    this.updateBackForwardButtons();
  
    // Card Container
    const card = panel.append("div")
      .attr("class", "artist-card");
  
    // Header Section: Artist image and title info
    const header = card.append("div")
      .attr("class", "artist-card-header")
      .style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "space-between")
      .style("margin-bottom", "16px");
  
    const leftSection = header.append("div")
      .style("display", "flex")
      .style("align-items", "center");
  
    let imageUrl = "img/artist_network/default_artist.png";
    const key = artist.id.toLowerCase();
    if (this.artistImagesMapping[key]) imageUrl = this.artistImagesMapping[key];
  
    leftSection.append("img")
      .attr("src", imageUrl)
      .style("width", "80px")
      .style("height", "80px")
      .style("border-radius", "50%")
      .style("object-fit", "cover")
      .style("margin-right", "16px")
      .style("border", "2px solid #fff");
  
    const textContainer = leftSection.append("div");
    textContainer.append("h2")
      .text(artist.artist_name)
      .attr("class", "artist-name");
  
    textContainer.append("p")
      .text(`Rank by total streams: #${artist.total_stream_rank}`)
      .attr("class", "artist-rank");
  
    // If viewing "all" years, show the years on chart if available
    if (this.currentYear === "all" && artist.years_on_chart) {
      textContainer.append("p")
        .attr("class", "years-on-chart")
        .text(`Years on Chart: ${artist.years_on_chart}`);
    }

    // Meta Information Section using a data-driven approach
    const metaData = [
      { label: "Collaborators", value: artist.collaborators.collaborator_count },
      { label: "Solo Songs", value: artist.solo_song_count },
      { label: "Collab Songs", value: artist.collab_song_count }
    ];
  
    const metaSection = card.append("div")
      .attr("class", "artist-meta")
      .style("margin-bottom", "16px");
  
    // Loop over each meta field and append a styled span
    metaData.forEach(field => {
      metaSection.append("span")
        .attr("class", "meta-field")
        .text(`${field.label}: ${field.value}`);
    });
  
    // Divider
    card.append("hr")
      .style("border-top", "1px solid #444")
      .style("margin", "16px 0");
  
    // Update the artist details table
    this.updateArtistDetailsTable(artist);
  
    // Minimize and Close buttons
    panel.append("button")
      .attr("id", "info-panel-minimize-btn")
      .classed("nav-button minimize-button", true)
      .html('<i class="fa-solid fa-minus"></i>')
      .on("click", () => this.minimizeInfo());
  
    panel.append("button")
      .attr("id", "info-panel-close-btn")
      .classed("nav-button minimize-button", true)
      .html('<i class="fa-solid fa-xmark"></i>')
      .on("click", () => this.resetVisualization());
  
    this.showInstructionToggleIcon();
  }
  

  clearInfoPanel() {
    d3.select("#info-panel")
      .html("")
      .style("display", "none");
    this.isInstructionView = false;
}

updateArtistDetailsTable(artist) {
  const panel = d3.select("#info-panel");

  // Remove existing table if any
  panel.selectAll(".artist-details-table").remove();

  const container = panel.append("div")
      .attr("class", "artist-details-table");

  container.append("h3").text("Songs in the Spotify Global Top 200");

  const table = container.append("table").attr("class", "info-table");

  // Define header data with sortable flag and key (note: artist column is not sortable)
  const headers = [
    { label: "Song Name", key: "song_name", sortable: true },
    { label: "Artist", key: "artist_names", sortable: false },
    { label: "Release Date", key: "release_date", sortable: true }
  ];

  // Create header row using the headers array
  const headerRow = table.append("thead").append("tr");
  headerRow.selectAll("th")
    .data(headers)
    .enter()
    .append("th")
    .attr("class", d => d.sortable ? "sortable" : "")
    .text(d => d.label);

  const tbody = table.append("tbody");

  // Merge solo and collab songs into one array
  let songEntries = [
      ...Object.entries(artist.solo_songs).map(([id, s]) => ({...s, type: "solo"})),
      ...Object.entries(artist.collab_songs).map(([id, s]) => ({...s, type: "collab"}))
  ];

  // Sorting state: no sort applied initially (use null to denote natural order)
  let sortKey = null;
  let ascending = true;

  // Function to render the table rows based on the current sort state
  const sortTable = () => {
    // Only sort if a sortKey is defined; otherwise, use the natural order
    if (sortKey) {
      songEntries.sort((a, b) => {
        let valA = a[sortKey];
        let valB = b[sortKey];

        // If sorting by date, convert strings to Date objects
        if (sortKey === "release_date") {
          valA = new Date(valA);
          valB = new Date(valB);
        } else if (typeof valA === "string" && typeof valB === "string") {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        }

        return ascending ? d3.ascending(valA, valB) : d3.descending(valA, valB);
      });
    }

    // Clear any existing rows
    tbody.selectAll("tr").remove();

    // Append rows for each song entry
    const rows = tbody.selectAll("tr")
        .data(songEntries)
        .enter()
        .append("tr");

    // Song Name column
    rows.append("td").text(d => d.song_name);

    // Artist column (as clickable names, with the current artist rendered as plain text)
    rows.append("td").html(d =>
      d.artist_names.map(artistName => {
        const isSelf = artistName.toLowerCase() === artist.artist_name.toLowerCase();
        return isSelf
            ? `<span>${artistName}</span>`
            : `<u class="clickable-artist" data-name="${artistName}">${artistName}</u>`;
      }).join(", ")
    );

    // Release Date column
    rows.append("td").text(d => d.release_date);

    // Bind click event for clickable artist names
    tbody.selectAll(".clickable-artist")
      .style("cursor", "pointer")
      .on("click", (event) => {
        event.stopPropagation();
        const clickedName = event.target.getAttribute("data-name");
        if (!clickedName) return;
        this.searchArtist(clickedName);
      });
  };

  // Function to update header text with sort indicators
  const updateHeaderArrows = () => {
    headerRow.selectAll("th")
      .html(function(d) {
        if (d.sortable && sortKey === d.key) {
          // Add a span for the arrow with a class depending on sort order
          const arrowClass = ascending ? "asc" : "desc";
          return d.label + ' <span class="sort-arrow ' + arrowClass + '"></span>';
        }
        return d.label;
      });
  };
  

  // Initial render (natural order)
  sortTable();
  updateHeaderArrows();

  // Add click event listeners for sortable headers only
  headerRow.selectAll("th")
    .filter(d => d.sortable)
    .on("click", (event, d) => {
      // Toggle ascending if the same column is clicked; otherwise, set new sort key
      if (sortKey === d.key) {
        ascending = !ascending;
      } else {
        sortKey = d.key;
        ascending = true;
      }
      updateHeaderArrows();
      sortTable();
    });
}



  bindSVGBackgroundClick() {
    d3.select("#overlay").on("click", () => this.hideInfo());
  }

  computeSpecialNodes(nodes) {
    const topSoloNode = nodes.find(d => d.is_most_streamed_solo_artist == 1) || null;
    const topCollabNode = nodes.find(d => d.is_most_streamed_collab_artist == 1) || null;
    const maxCollabNode = nodes.find(d => d.is_artist_with_most_collaborations == 1) || null;

    if (!topSoloNode || !topCollabNode || !maxCollabNode) {
        console.warn("One or more special nodes were not found in the dataset.");
    }

    console.log(`Top Solo Node: ${topSoloNode.id}`)
    console.log(`Top Collab Node: ${topCollabNode.id}`)
    console.log(`Most Collaborated Node: ${maxCollabNode.id}`)

    return { topSoloNode, topCollabNode, maxCollabNode };
  }


  labelSpecialArtists() {
    // Reuse cached special labels if available and if not in focused view.
    // Otherwise, remove any existing special highlights.
    this.state.graphGroup.select(".special-highlights").remove();
    
    const nodes = this.state.globalNodes;
    if (!nodes || nodes.length === 0) return;
    
    // Use the helper to compute special nodes.
    const { topSoloNode, topCollabNode, maxCollabNode } = this.computeSpecialNodes(nodes);
    
    // Build an array of special nodes, avoiding duplicates.
    let specialNodes = [];
    if (topCollabNode) specialNodes.push(topCollabNode);
    if (maxCollabNode && maxCollabNode !== topCollabNode) specialNodes.push(maxCollabNode);
    if (topSoloNode) specialNodes.push(topSoloNode);
    if (specialNodes.length === 0) return;
    
    // Create a group for all special highlights and tooltips.
    const highlightGroup = this.state.graphGroup.append("g")
      .attr("class", "special-highlights")
      .style("opacity", 0);
    // Array to store bounding boxes for collision detection.
    const placedTooltips = [];
    
    // Helper: check if two bounding boxes overlap.
    function boxesOverlap(a, b) {
      return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
    }
    
    // Set font sizes based on whether "all years" is active.
    const isAllYears = (this.currentYear === "all");
    const headerFontSize = isAllYears ? 144 : 56;
    const artistFontSize = isAllYears ? 132 : 48;
    
    // Helper function: Render tooltip for a given node in either "top" or "bottom" configuration.
    // Returns a Promise that resolves with an object containing the tooltipGroup and its bounding box.
    const renderTooltip = (node, position) => {
      const tooltipGroup = highlightGroup.append("g")
        .attr("class", "special-network-tooltip")
        .style("pointer-events", "none")
        .attr("opacity", 0.6);
      
      const textGroup = tooltipGroup.append("g")
        .attr("class", "text-group");
      
      // Determine header title based on node type.
      let headerTitle = "";
      if (node === topSoloNode) {
        headerTitle = "Most Streamed Solo Artist";
      } else if (node === topCollabNode && node === maxCollabNode) {
        headerTitle = "Most Streamed Collab Artist & Most Artist Collabs";
      } else if (node === topCollabNode) {
        headerTitle = "Most Streamed Collab Artist";
      } else if (node === maxCollabNode) {
        headerTitle = "Most Artist Collabs";
      }
      
      const headerText = textGroup.append("text")
        .attr("x", 0)
        .attr("y", 0)
        .attr("text-anchor", "middle")
        .style("fill", "#fff")
        .style("font-size", headerFontSize + "px")
        .style("font-weight", "bold")
        .text(headerTitle);
      
      const artistText = textGroup.append("text")
        .attr("x", 0)
        .attr("y", 0)
        .attr("text-anchor", "middle")
        .style("fill", "#fff")
        .style("font-size", artistFontSize + "px")
        .style("font-weight", "bold")
        .text(node.artist_name);
      
      return new Promise(resolve => {
        setTimeout(() => {
          const headerBBox = headerText.node().getBBox();
          headerText.attr("y", headerBBox.height);
          const lineSpacing = 10;
          const artistY = headerBBox.height + lineSpacing + artistText.node().getBBox().height;
          artistText.attr("y", artistY);
          
          const textBBox = textGroup.node().getBBox();
          // Use proportional margins (applied uniformly for all years)
          const marginTop = textBBox.height * 0.05;
          const marginBottom = textBBox.height * 0.2;
          const marginX = textBBox.width * 0.1;
          
          const rectWidth = textBBox.width + marginX * 2;
          const rectHeight = textBBox.height + marginTop + marginBottom;
          
          const bgRect = tooltipGroup.insert("rect", ".text-group")
            .attr("x", -rectWidth / 2)
            .attr("y", 0)
            .attr("width", rectWidth)
            .attr("height", rectHeight)
            .attr("rx", 8)
            .attr("ry", 8)
            .style("stroke", "#fff")
            .style("stroke-width", 2);
          
          textGroup.attr("transform", `translate(0, ${marginTop})`);
          
          const arrowHeight = 12;
          let arrowPath = "";
          let totalHeight = rectHeight + arrowHeight;
          if (position === "top") {
            arrowPath = `M-10,${rectHeight} L0,${rectHeight + arrowHeight} L10,${rectHeight} Z`;
          } else {
            arrowPath = `M-10,0 L0,${-arrowHeight} L10,0 Z`;
          }
          tooltipGroup.append("path")
            .attr("d", arrowPath)
            .style("stroke-width", 2);
          
          const nodeRadius = this.state.totalStreamRadiusScale(node.total_streams);
          const gap = 10;
          let groupFinalY;
          if (position === "top") {
            const bottomY = node.y - nodeRadius - gap;
            groupFinalY = bottomY - totalHeight;
          } else {
            const topY = node.y + nodeRadius + gap;
            groupFinalY = topY + arrowHeight;
          }
          tooltipGroup.attr("transform", `translate(${node.x}, ${groupFinalY})`);
          
          const bbox = {
            x1: node.x - rectWidth / 2,
            x2: node.x + rectWidth / 2,
            y1: (position === "bottom") ? groupFinalY - arrowHeight : groupFinalY,
            y2: (position === "top") ? (groupFinalY + totalHeight + arrowHeight) : (groupFinalY + rectHeight)
          };
          resolve({ tooltipGroup, bbox });
        }, 0);
      });
    };
    
    // Helper function: Place tooltip for a node; if collision detected, flip configuration.
    const placeTooltipForNode = async (node) => {
      // Draw a white ring around the node and allow pointer events.
      const ring = highlightGroup.append("circle")
        .attr("cx", node.x)
        .attr("cy", node.y)
        .attr("r", this.state.totalStreamRadiusScale(node.total_streams) + 6)
        .classed("special-ring", true);
      
      let result = await renderTooltip.call(this, node, "top");
      let collided = false;
      for (const box of placedTooltips) {
        if (boxesOverlap(result.bbox, box)) {
          collided = true;
          break;
        }
      }
      if (collided) {
        result.tooltipGroup.remove();
        result = await renderTooltip.call(this, node, "bottom");
      }
      placedTooltips.push(result.bbox);
      
      // Attach hover events to the ring.
      ring.on("mouseover", () => {
        result.tooltipGroup.transition().duration(200).attr("opacity", 1);
        result.tooltipGroup.select("rect").transition().duration(200).style("stroke-opacity", 1);
      }).on("mouseout", () => {
        result.tooltipGroup.transition().duration(200).attr("opacity", 0.6);
        result.tooltipGroup.select("rect").transition().duration(200).style("stroke-opacity", 0.6);
      });
      
      // Also attach hover events to the node itself.
      const nodeSel = this.state.nodeElements.filter(d => d.id === node.id);
      if (!nodeSel.empty()) {
        nodeSel.on("mouseover", (event, d) => {
          const tooltip = this.state.tooltip;
          
          // Show/hide the tooltip as usual
          tooltip.transition().duration(200).style("opacity", 0.9);
          tooltip.html(`
            <div class="network-tooltip-header">
                ${d.artist_name} <span class="network-tooltip-rank">#${d.total_stream_rank}</span>
            </div>
            <div class="network-tooltip-row">
                <span class="network-tooltip-label">Top Songs:</span> ${d.solo_song_count + d.collab_song_count}
                (${d.solo_song_count} solo / ${d.collab_song_count} collab)
            </div>
            <div class="network-tooltip-row">
                <span class="network-tooltip-label">Unique Artist Collabs:</span> ${d.collaborators.collaborator_count}
            </div>
          `)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
          
          // IMPORTANT: Enforce the same font sizes you use for regular nodes
          tooltip.select(".network-tooltip-header").style("font-size", "16px");
          tooltip.selectAll(".network-tooltip-row").style("font-size", "14px");
        
          // If you also have a specialized SVG label or ring, you can still show it here,
          // but keep it separate from the HTML tooltip.
          result.tooltipGroup.transition().duration(200).attr("opacity", 1);
          result.tooltipGroup.select("rect")
            .transition().duration(200)
            .style("stroke-opacity", 1);
        })
        .on("mouseout", () => {
          // Hide the HTML tooltip
          this.state.tooltip.transition().duration(200).style("opacity", 0);
        
          // Also hide/fade the specialized annotation
          result.tooltipGroup.transition().duration(200).attr("opacity", 0.6);
          result.tooltipGroup.select("rect")
            .transition().duration(200)
            .style("stroke-opacity", 0.6);
        });
        

      }
    };
    
    // Sort special nodes by their y coordinate (ascending).
    specialNodes.sort((a, b) => a.y - b.y);
    
    (async () => {
      for (const node of specialNodes) {
        await placeTooltipForNode.call(this, node);
      }
      // Cache the rendered labels along with the current year.
      this.state.cachedSpecialLabels = this.state.graphGroup.select(".special-highlights").node();
      this.state.cachedSpecialLabelsYear = this.currentYear;
    })();
    // Fixes issue with jumbled special highlighting text on display
    highlightGroup.transition().duration(500).style("opacity", 0.6);
  }

  applyTopKFilter() {
    const topK = +d3.select("#topk-input").property("value");
    const networkSvg = d3.select("#main-network-svg");
    d3.select("#topk-value").text(topK);

    if (!this.state.globalNodes || this.state.globalNodes.length === 0) return;

    if (topK === 0) {
      this.state.overlayElements.style("opacity", 0);
      this.state.graphGroup.select('.topk-labels').remove();
      networkSvg.select(".topk-proportions").remove();
      this.state.graphGroup.select(".top-artists").remove();
      return;
    }

    const topKNodes = this.state.globalNodes.filter(d => d.total_stream_rank > 0 && d.total_stream_rank <= topK);
    const topKSet = new Set(topKNodes.map(d => d.id));

    // Add golden halo effect to filtered nodes
    this.state.overlayElements.style("opacity", d =>
      topKSet.has(d.id) ? 1 : 0
    );
  
    // Remove any previously created top-K labels
    this.state.graphGroup.select('.topk-labels').remove();

    // Count proportions using `is_solo_artist`
    const soloCount = topKNodes.filter(d => d.is_solo_artist).length;
    const collabCount = topKNodes.length - soloCount;
    const soloPercent = Math.round((soloCount / topKNodes.length) * 100);
    const collabPercent = Math.round((collabCount / topKNodes.length) * 100);
  
    // Remove any previous proportions group
    networkSvg.select(".topk-proportions").remove();
  
    // Get SVG size
    const svgNode = networkSvg.node();
    const { height: svgHeight } = svgNode.getBoundingClientRect();
  
    const proportionGroup = networkSvg.append("g")
      .attr("class", "topk-proportions")
      .attr("transform", `translate(10, ${svgHeight - 50})`);
  
    proportionGroup.append("rect")
      .attr("width", 12)
      .attr("height", 12)
      .attr("x", 0)
      .attr("y", 0)
      .style("fill", window.COLLAB_COLOR);
  
    proportionGroup.append("text")
      .attr("x", 16)
      .attr("y", 10)
      .style("fill", "#fff")
      .style("font-size", "12px")
      .text(`Collab: ${collabPercent}%`);
  
    proportionGroup.append("rect")
      .attr("width", 12)
      .attr("height", 12)
      .attr("x", 0)
      .attr("y", 20)
      .style("fill", window.SOLO_COLOR);
  
    proportionGroup.append("text")
      .attr("x", 16)
      .attr("y", 30)
      .style("fill", "#fff")
      .style("font-size", "12px")
      .text(`Solo: ${soloPercent}%`);
  }

  /*
  Zooms and adjusts the SVG network display corresponding to the selected
  node and its first-degree related nodes (direct collaborators to the artist)
  */
  zoomToNodeAndNeighbors(connectedNodes) {
    const { svg, nodeElements, graphGroup, zoom } = this.state;

    const bbox   = this.computeBoundingBoxWithExtremes(nodeElements, d => connectedNodes.has(d.id));
    const MARGIN = 50;
    const boxW   = bbox.xMax - bbox.xMin + MARGIN * 2;
    const boxH   = bbox.yMax - bbox.yMin + MARGIN * 2;
    const centerX = (bbox.xMin + bbox.xMax) / 2;
    const centerY = (bbox.yMin + bbox.yMax) / 2;

    const panelRect = document.getElementById("info-panel").getBoundingClientRect();
    const usableWidth = panelRect.left;
    const usableHeight = document.getElementById("artist-network-container").clientHeight;

    const scale = Math.min(usableWidth / boxW, usableHeight / boxH, 5);

    const transform = d3.zoomIdentity
      .translate(usableWidth / 2, usableHeight / 2)
      .scale(scale)
      .translate(-centerX, -centerY);

    graphGroup.selectAll(".bounding-box").remove();
    //! FOR DEBUGGING PURPOSES on zoom-to-fit on artist-mode views
    // graphGroup.append("rect")
    //   .attr("class", "bounding-box")
    //   .attr("x", bbox.xMin - MARGIN)
    //   .attr("y", bbox.yMin - MARGIN)
    //   .attr("width",  boxW)
    //   .attr("height", boxH)
    //   .attr("fill", "none")
    //   .attr("stroke", "orange")
    //   .attr("stroke-dasharray", "5,5");

    svg.transition().duration(750).call(zoom.transform, transform);
  }

  computeBoundingBoxWithExtremes(nodeSelection, filterFn = () => true) {
    let xMin = Infinity, xMax = -Infinity;
    let yMin = Infinity, yMax = -Infinity;

    let leftmostNode = null;
    let rightmostNode = null;
    let topmostNode = null;
    let bottommostNode = null;

    // Compute basic extremes from node positions.
    nodeSelection.each(d => {
      if (!filterFn(d)) return;
      if (d.x < xMin) { xMin = d.x; leftmostNode = d; }
      if (d.x > xMax) { xMax = d.x; rightmostNode = d; }
      if (d.y < yMin) { yMin = d.y; topmostNode = d; }
      if (d.y > yMax) { yMax = d.y; bottommostNode = d; }
    });
  
    // Only consider labels that are not within the Top K labels container.
    d3.selectAll(".artist-label")
      .filter(function() {
        // Exclude labels if their closest ancestor has the "topk-labels" class.
        return !this.closest('.topk-labels');
      })
      .each(function(d) {
        if (!filterFn(d)) return;
        const bbox = this.getBBox();
        const dx = parseFloat(d3.select(this).attr("dx")) || 0;
        const dy = parseFloat(d3.select(this).attr("dy")) || 0;
        const labelRight = d.x + dx + bbox.width;
        // Assuming the label’s baseline is at d.y, subtract bbox.height to approximate the top edge.
        const labelTop = d.y + dy - bbox.height;
        
        if (labelRight > xMax) {
          xMax = labelRight;
          rightmostNode = d;
        }
        if (labelTop < yMin) {
          yMin = labelTop;
          topmostNode = d;
        }
      });
  
    return { xMin, xMax, yMin, yMax, leftmostNode, rightmostNode, topmostNode, bottommostNode };
  }

  minimizeInfo() {
    d3.select("#info-panel").style("display", "none");
    this.showInstructionToggleIcon();
}


  /* Fits the initial graph view for when datasets are rendere for the first time */
  fitGraphToSVG() {
    const nodes = this.state.globalNodes;

    // Collect bounding boxes
    let minX = d3.min(nodes, d => d.x - this.state.totalStreamRadiusScale(d.total_streams));
    let maxX = d3.max(nodes, d => d.x + this.state.totalStreamRadiusScale(d.total_streams));
    let minY = d3.min(nodes, d => d.y - this.state.totalStreamRadiusScale(d.total_streams));
    let maxY = d3.max(nodes, d => d.y + this.state.totalStreamRadiusScale(d.total_streams));

    // If special annotations are present
    const specialLabels = this.state.graphGroup.selectAll(".special-network-tooltip").nodes();
    specialLabels.forEach(el => {
        const bbox = el.getBBox();
        minX = Math.min(minX, bbox.x);
        minY = Math.min(minY, bbox.y);
        maxX = Math.max(maxX, bbox.x + bbox.width);
        maxY = Math.max(maxY, bbox.y + bbox.height);
    });

    // Add padding
    const padding = 240;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    // Compute padded center and zoom
    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;

    const svg = this.state.svg;
    const svgWidth = this.state.width;
    const svgHeight = this.state.height;

    const scale = Math.min(svgWidth / boundsWidth, svgHeight / boundsHeight);
    const translateX = (svgWidth - scale * (minX + maxX)) / 2;
    const translateY = (svgHeight - scale * (minY + maxY)) / 2;

    svg.transition()
        .duration(1000)
        .call(this.state.zoom.transform, d3.zoomIdentity.translate(translateX, translateY).scale(scale));
  }

  restoreHistoryForYear(year) {
    if (!this.state.historyByYear[year]) {
        this.state.historyByYear[year] = { history: [], index: -1 };
    }
    const currentHistory = this.state.historyByYear[year];
    this.state.selectionHistory = currentHistory.history;
    this.state.historyIndex = currentHistory.index;
  }


  pushToHistory(artistNode, source = "unknown") {
    const year = this.currentYear;
    const historyObj = this.state.historyByYear[year];
    if (!historyObj) return;

    const newArtistId = artistNode.id.toLowerCase();

    // Reject immediate duplicates
    if (historyObj.history[historyObj.index]?.artistNode?.id?.toLowerCase() === newArtistId) {
        return;
    }

    // ⛔ REMOVE THIS ⛔
    // if (historyObj.index < historyObj.history.length - 1) {
    //     historyObj.history = historyObj.history.slice(0, historyObj.index + 1);
    // }

    // ✅ Just append the new entry
    historyObj.history.push({
        artistNode,
        source,
        timestamp: Date.now()
    });
    historyObj.index = historyObj.history.length - 1;

    this.updateBackForwardButtons();
    this.debugHistory();
  }




  goBack() {
    const historyObj = this.state.historyByYear[this.currentYear];
    if (historyObj.index > 0) {
        historyObj.index--;
        const artistEntry = historyObj.history[historyObj.index];
        console.log(`[DEBUG] goBack() → Switching to: ${artistEntry.artistNode.artist_name} [${artistEntry.source}]`);
        this.searchArtist(artistEntry.artistNode.artist_name, { isHistoryNavigation: true });
        this.debugHistory();
    }
}

goForward() {
    const historyObj = this.state.historyByYear[this.currentYear];
    if (historyObj.index < historyObj.history.length - 1) {
        historyObj.index++;
        const artistEntry = historyObj.history[historyObj.index];
        console.log(`[DEBUG] goForward() → Switching to: ${artistEntry.artistNode.artist_name} [${artistEntry.source}]`);
        this.searchArtist(artistEntry.artistNode.artist_name, { isHistoryNavigation: true });
        this.debugHistory();
    }
}


  debugHistory(year = this.currentYear) {
    const h = this.state.historyByYear[year];
    if (!h) {
        console.log(`[DEBUG] No history found for year ${year}`);
        return;
    }

    console.log(`----------------------------`);
    console.log(`[DEBUG] Current Year: ${year}`);
    console.log(`[DEBUG] History Length: ${h.history.length}`);
    console.log(`[DEBUG] Current Pointer Index: ${h.index}`);
    if (h.history[h.index]) {
        console.log(`[DEBUG] Current Artist: ${h.history[h.index].artistNode.artist_name}`);
        console.log(`[DEBUG] Source Event: ${h.history[h.index].source}`);
    } else {
        console.log(`[DEBUG] Current Artist: None`);
    }

    console.log(`[DEBUG] Full Search History:`);

    h.history.forEach((entry, i) => {
        const mark = (i === h.index) ? " <-- [Pointer]" : "";
        console.log(`  ${i}: ${entry.artistNode.artist_name} [${entry.source}]${mark}`);
    });
    console.log(`----------------------------`);
}



  
  updateBackForwardButtons() {
    const currentHistory = this.state.historyByYear[this.currentYear];
    const index = currentHistory.index;
    const historyLength = currentHistory.history.length;
    console.log()
    
    d3.select("#back-button").property("disabled", index <= 0);
    d3.select("#forward-button").property("disabled", index >= historyLength - 1);
  }
  

  searchArtist(artistName, { isHistoryNavigation = false } = {}) {
    if (!artistName || !artistName.trim()) return;

    const cleanName = artistName.trim();

    // Lookup node
    const matchedNode = this.state.globalNodes.find(
        n => n.artist_name.toLowerCase() === cleanName.toLowerCase()
    );

    if (!matchedNode) {
        console.warn(`Artist "${cleanName}" not found`);
        return;
    }

    // ---- HISTORY MANAGEMENT ----
    if (!isHistoryNavigation) {
      console.log(`[DEBUG] searchArtist() → New Search via search_bar: ${matchedNode.artist_name}`);
      this.pushToHistory(matchedNode, "search_bar");
    } else {
        console.log(`[DEBUG] searchArtist() → History Navigation Event`);
    }
    


    // ---- Update Search Input ----
    d3.select("#search-input").property("value", matchedNode.artist_name);

    // ---- Highlight & Show Info ----
    this.state.userInteracted = true;
    this.highlightNeighbors(matchedNode);
    this.updateArtistDetailsTable(this.state.artistInfo[matchedNode.id]);
}




  setupUIControls() {
    // Year buttons: attach click events for dataset switching
    d3.selectAll(".year-button").on("click", event => {
      // Remove active styling from all buttons first
      d3.selectAll(".year-button").classed("active", false);
      // Then add active styling to the clicked button
      d3.select(event.target).classed("active", true);
      
      // Reset toggle icon and clear any artist selection before loading the new dataset.
      this.resetToggleIconForDatasetSwitch();
      this.clearInfoPanel();
      
      const year = d3.select(event.target).attr("data-year");
      this.loadData(year);
    });
    
    // Set active class on the button that corresponds to the preloaded dataset
    const initialYear = this.options.initialYear || "2024";
    d3.selectAll(".year-button").classed("active", false);
    d3.select(`.year-button[data-year="${initialYear}"]`).classed("active", true);
    
    // Declare a variable to hold the index of the currently highlighted suggestion
    let currentSuggestionIndex = -1;
  
    // Attach input and keydown events on the search input element
    d3.select("#search-input")
      .on("input", event => {
        const searchTerm = d3.select(event.target).property("value").trim();
        const suggestionsDiv = d3.select("#search-suggestions");
        
        // Clear suggestions if search term is empty
        if (!searchTerm) {
          suggestionsDiv.html("");
          currentSuggestionIndex = -1;
          return;
        }
        
        // Use fuse.js to filter the nodes (you could also use your topK filter here)
        const fuseOptions = {
          keys: ['artist_name'],
          threshold: 0.3
        };
        const fuse = new Fuse(this.state.globalNodes, fuseOptions);
        const results = fuse.search(searchTerm);
        
        // Get the top 5 suggestions
        const suggestions = results.slice(0, 5).map(result => result.item);
        
        // Update suggestions dropdown
        suggestionsDiv.html("");
        currentSuggestionIndex = -1; // Reset the index whenever new suggestions are rendered
        suggestions.forEach(suggestion => {
          suggestionsDiv.append("div")
            .attr("class", "suggestion-item")
            .text(suggestion.artist_name)
            .on("click", () => {
              // Auto-fill search input and trigger selection
              d3.select("#search-input").property("value", suggestion.artist_name);
              suggestionsDiv.html("");
              currentSuggestionIndex = -1;
              this.state.userInteracted = true;
              this.state.graphGroup.select(".special-highlights").style("display", "none");
              this.highlightNeighbors(suggestion);
            });
        });
      })
      .on("keydown", function(event) {
        const suggestionsDiv = d3.select("#search-suggestions");
        const suggestionItems = suggestionsDiv.selectAll(".suggestion-item").nodes();
        const numSuggestions = suggestionItems.length;
        
        // Arrow Down: move selection down
        if (event.key === "ArrowDown") {
          event.preventDefault();
          currentSuggestionIndex = (currentSuggestionIndex + 1) % numSuggestions;
          highlightSuggestion(suggestionItems, currentSuggestionIndex);
        }
        // Arrow Up: move selection up
        else if (event.key === "ArrowUp") {
          event.preventDefault();
          if (currentSuggestionIndex === -1) {
              currentSuggestionIndex = numSuggestions - 1; // jump directly to the LAST item
          } else {
              currentSuggestionIndex = (currentSuggestionIndex - 1 + numSuggestions) % numSuggestions;
          }
          highlightSuggestion(suggestionItems, currentSuggestionIndex);
      }
      
        // Enter: trigger suggestion selection or perform search based on text
        else if (event.key === "Enter") {
          event.preventDefault();
          let searchHandled = false;
          if (currentSuggestionIndex >= 0 && numSuggestions > 0) {
              suggestionItems[currentSuggestionIndex].click();
              searchHandled = true;
          } else {
              // Get search field value
              const rawValue = d3.select(event.target).property("value");
              const searchTerm = rawValue ? rawValue.trim() : "";
              if (searchTerm) {
                  this.searchArtist(searchTerm);
                  searchHandled = true;
              }
          }
          // Cleanup
          currentSuggestionIndex = -1;
          if (searchHandled) {
              suggestionsDiv.html("");
          }
      }
      
      }.bind(this)); // bind 'this' so that "this.state" and "this.highlightNeighbors" work correctly

    // Slider logic for topK filter
    d3.select("#topk-input")
      .on("input", event => {
        const value = event.target.value;
        d3.select("#topk-value").text(value);
        this.applyTopKFilter();
      });
  }

  resetToggleIconForDatasetSwitch() {
    // Clear any selected artist.
    this.currentArtist = null;

    // Optionally, reset other state flags.
    this.isInstructionView = false;

    // Update the toggle button to only show instructions mode.
    const toggleIcon = d3.select("#instruction-toggle-icon");
    if (!toggleIcon.empty()) {
      // Remove artist-mode styling and ensure instructions-mode is applied.
      toggleIcon.classed("artist-mode", false)
                .classed("instructions-mode", true)
                .html('<i class="fa fa-info" aria-hidden="true"></i>');
    }

    // Also, if needed, reset or hide the info panel.
    d3.select("#info-panel").style("display", "none");
  }
}

//! HELPER FUNCTIONS
// Helper function to highlight a suggestion in the list
function highlightSuggestion(suggestionNodes, activeIndex) {
  suggestionNodes.forEach((node, index) => {
    console.log(`activeindex: ${activeIndex} | index: ${index}`)
    d3.select(node).classed("active-suggestion", index === activeIndex);
  });
}

// Helper function to parse artist names from a CSV field
// It uses the known artist IDs to recombine parts if needed.
function parseArtistNames(artistString, knownArtistsSet) {
  const parts = artistString.split(",").map(s => s.trim());
  const names = [];
  for (let i = 0; i < parts.length; i++) {
    // If possible, combine with the next part and check if it is a known artist.
    if (i < parts.length - 1) {
      const combined = parts[i] + ", " + parts[i+1];
      if (knownArtistsSet.has(combined.toLowerCase())) {
        names.push(combined);
        i++; // Skip the next part since it was combined.
        continue;
      }
    }
    names.push(parts[i]);
  }
  return names;
}

document.addEventListener("click", (event) => {
  // We'll look up the suggestions div and search input
  const suggestionsDiv = document.getElementById("search-suggestions");
  const searchInput = document.getElementById("search-input");

  // If the click happened outside both the search input and the suggestions container, clear them
  if (
    suggestionsDiv &&
    searchInput &&
    !searchInput.contains(event.target) &&
    !suggestionsDiv.contains(event.target)
  ) {
    suggestionsDiv.innerHTML = "";
  }
});