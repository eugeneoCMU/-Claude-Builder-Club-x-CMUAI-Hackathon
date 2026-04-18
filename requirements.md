## Introduction

Kintsugi Network is an interactive art installation that transforms human vulnerability into collective beauty. Visitors submit personal reflections — a biggest regret, a proudest moment, and a half-finished dream — through a Google Form. Responses are compiled into a Google Spreadsheet, which serves as the source of truth for all submissions. The system parses entries from this spreadsheet and transforms each submission into a unique AI-generated artwork shard — an irregular, broken pottery-like shape inspired by the Japanese philosophy of Kintsugi. These shards are layered into a living mosaic displayed on a full-screen canvas, connected by glowing gold threads. As new entries arrive, shards are stacked on top of the existing composition, building depth and richness over time. When visitors interact with the mosaic, poetic connections between strangers are revealed. The installation grows more complex with every contribution, turning individual fragments into a cohesive tapestry of shared humanity.

## Glossary

- **Google_Form**: The externally managed Google Form where visitors enter their three personal reflections (regret, proudest moment, half-finished dream). The form is configured and maintained outside the system.
- **Spreadsheet**: The Google Spreadsheet that automatically collects responses from the Google_Form. The Spreadsheet serves as the source of truth for all visitor submissions.
- **Spreadsheet_Parser**: The service responsible for reading, validating, and importing new entries from the Spreadsheet into the system.
- **Reflection**: A single text entry provided by a visitor in one of three categories: regret, proudest moment, or half-finished dream.
- **Shard**: A unique AI-generated artwork created from a visitor's three reflections, rendered as an irregular, broken pottery-like shape in the mosaic. Shards have organic, jagged edges reminiscent of fractured ceramic pieces.
- **Mosaic**: The full-screen, continuously evolving composition of all visitor shards layered into a cohesive image. New shards are stacked on top of existing ones.
- **Gold_Thread**: A visual connector rendered between and around shards, styled as a thick gold seam inspired by Kintsugi, representing the bonds between individual stories.
- **Poetic_Connection**: A short, evocative text phrase revealed during interaction that highlights thematic links between two or more shards (e.g., "two lives, one ache").
- **Shard_Generator**: The AI-powered service responsible for transforming a visitor's three reflections into a unique artwork shard with an irregular, pottery-fragment shape.
- **Connection_Analyzer**: The AI-powered service responsible for identifying thematic similarities between reflections and generating poetic connection phrases.
- **Mosaic_Renderer**: The front-end rendering engine responsible for composing shards, gold threads, and animations into the full-screen mosaic display.
- **Visitor**: A person interacting with the Kintsugi Network installation, either by submitting reflections via the Google_Form or exploring the mosaic.

## Requirements

### Requirement 1: Parse Visitor Reflections from Google Spreadsheet

**User Story:** As an installation operator, I want the system to parse visitor submissions from a Google Spreadsheet, so that reflections collected via Google Forms are automatically imported into the mosaic pipeline.

#### Acceptance Criteria

1. THE Spreadsheet_Parser SHALL connect to a configured Google Spreadsheet and read entries containing visitor reflections.
2. WHEN the Spreadsheet_Parser reads a new entry from the Spreadsheet, THE Spreadsheet_Parser SHALL extract the three Reflection fields (biggest regret, proudest moment, half-finished dream) and forward them to the Shard_Generator.
3. THE Spreadsheet_Parser SHALL poll the Spreadsheet for new entries at a configurable interval with a default of 30 seconds.
4. THE Spreadsheet_Parser SHALL track which Spreadsheet rows have already been processed to avoid duplicate imports.
5. IF the Spreadsheet_Parser encounters a row with one or more empty Reflection fields, THEN THE Spreadsheet_Parser SHALL skip that row and log a warning indicating the incomplete entry.
6. IF the Spreadsheet_Parser encounters a Reflection exceeding 500 characters, THEN THE Spreadsheet_Parser SHALL truncate the Reflection to 500 characters before forwarding to the Shard_Generator.
7. IF the Spreadsheet_Parser cannot connect to the Spreadsheet, THEN THE Spreadsheet_Parser SHALL retry the connection up to 3 times with exponential backoff before logging an error.

### Requirement 2: Generate Unique Artwork Shards

**User Story:** As a Visitor, I want my reflections to be transformed into a unique piece of art shaped like a broken pottery fragment, so that my personal story is visually represented in the mosaic.

#### Acceptance Criteria

1. WHEN the Shard_Generator receives three Reflections from a parsed entry, THE Shard_Generator SHALL produce a single unique artwork Shard derived from the content of those Reflections.
2. THE Shard_Generator SHALL render each Shard with an irregular, jagged outline resembling a broken pottery fragment, with no two Shards sharing the same silhouette.
3. THE Shard_Generator SHALL produce visually distinct Shards for submissions containing different Reflection content.
4. WHEN the Shard_Generator completes Shard creation, THE Shard_Generator SHALL store the Shard with an association to its source Reflections.
5. IF the Shard_Generator fails to produce a Shard, THEN THE Shard_Generator SHALL retry the generation up to 3 times before logging an error.

### Requirement 3: Compose the Living Mosaic with Layered Shards

**User Story:** As a Visitor, I want to see all artwork shards layered into one cohesive full-screen composition, so that I can experience the collective tapestry of shared humanity growing over time.

#### Acceptance Criteria

1. THE Mosaic_Renderer SHALL display all generated Shards composed into a single cohesive full-screen composition with clear spacing between individual Shards.
2. WHEN a new Shard is generated, THE Mosaic_Renderer SHALL layer the new Shard on top of the current Mosaic composition without rearranging existing Shards.
3. THE Mosaic_Renderer SHALL maintain clear visual spacing between Shards so that individual shard edges and gold seams remain distinguishable.
4. THE Mosaic_Renderer SHALL arrange Shards so that overlapping Shards share visual harmony in color palette and composition.
5. THE Mosaic_Renderer SHALL maintain a responsive layout that adapts the Mosaic to different screen sizes and aspect ratios.
6. WHILE the Mosaic contains fewer than 4 Shards, THE Mosaic_Renderer SHALL display the available Shards centered on screen with placeholder areas indicating space for future contributions.

### Requirement 4: Render Gold Threads Between Shards

**User Story:** As a Visitor, I want to see gold seams connecting the shards, so that the mosaic evokes the Kintsugi philosophy of honoring fractures with beauty.

#### Acceptance Criteria

1. THE Mosaic_Renderer SHALL render Gold_Threads along the irregular edges and in the spacing between all adjacent or overlapping Shards in the Mosaic.
2. THE Mosaic_Renderer SHALL render Gold_Threads with a thick, luminous gold visual style consistent with the Kintsugi aesthetic.
3. WHEN a Visitor moves the cursor or touch point near a Gold_Thread, THE Mosaic_Renderer SHALL animate the Gold_Thread with a glowing effect that intensifies based on proximity.
4. THE Mosaic_Renderer SHALL render Gold_Threads as continuous seams that visually connect the entire Mosaic into a unified composition, filling the gaps between shard edges.

### Requirement 5: Animate Shard Interactions

**User Story:** As a Visitor, I want the shards to breathe and respond as I move through the mosaic, so that the installation feels alive and immersive.

#### Acceptance Criteria

1. WHILE a Visitor navigates the Mosaic, THE Mosaic_Renderer SHALL apply a subtle breathing animation to Shards near the cursor or touch point.
2. WHEN a Visitor hovers over or touches a Shard, THE Mosaic_Renderer SHALL scale the Shard slightly and increase its brightness to indicate focus.
3. THE Mosaic_Renderer SHALL animate Shard transitions at a frame rate of at least 30 frames per second to maintain visual fluidity.
4. WHEN a new Shard is layered onto the Mosaic, THE Mosaic_Renderer SHALL animate the Shard's appearance with a fade-in and gold-shimmer effect over a duration of 1 to 2 seconds.

### Requirement 6: Reveal Poetic Connections

**User Story:** As a Visitor, I want to discover poetic phrases that reveal hidden connections between strangers' stories, so that I feel a sense of shared humanity.

#### Acceptance Criteria

1. WHEN the Connection_Analyzer receives a new Shard and its associated Reflections, THE Connection_Analyzer SHALL identify thematic similarities with existing Reflections in the Mosaic.
2. WHEN the Connection_Analyzer identifies a thematic similarity between two or more Reflections, THE Connection_Analyzer SHALL generate a Poetic_Connection phrase of no more than 50 characters.
3. WHEN a Visitor hovers over or touches a Gold_Thread that has an associated Poetic_Connection, THE Mosaic_Renderer SHALL display the Poetic_Connection text along the Gold_Thread.
4. THE Mosaic_Renderer SHALL render Poetic_Connection text with a fade-in animation and a gold-tinted typographic style.
5. WHEN a Visitor moves away from a Gold_Thread, THE Mosaic_Renderer SHALL fade out the Poetic_Connection text over a duration of 0.5 seconds.

### Requirement 7: Scale the Mosaic with Contributions

**User Story:** As a Visitor, I want the mosaic to grow richer and more complex as more people contribute, so that the collective artwork evolves over time.

#### Acceptance Criteria

1. WHEN a new Shard is added to the Mosaic, THE Mosaic_Renderer SHALL layer the Shard on top of the existing composition, increasing the visual depth and complexity of the Mosaic.
2. THE Mosaic_Renderer SHALL support a Mosaic containing at least 1000 Shards without degradation of animation frame rate below 30 frames per second.
3. WHEN the Mosaic contains more Shards than can be displayed at full detail on the current screen, THE Mosaic_Renderer SHALL provide zoom and pan controls for the Visitor to explore the full Mosaic.
4. WHILE a Visitor zooms into the Mosaic, THE Mosaic_Renderer SHALL progressively increase Shard detail and reveal Poetic_Connection text on nearby Gold_Threads.

### Requirement 8: Persist Mosaic State with Spreadsheet as Source of Truth

**User Story:** As an installation operator, I want the mosaic state to be persisted and the Google Spreadsheet to serve as the source of truth for submissions, so that the artwork survives restarts and continues to grow across sessions.

#### Acceptance Criteria

1. THE Spreadsheet_Parser SHALL treat the Google Spreadsheet as the authoritative source of truth for all visitor submissions.
2. WHEN the Shard_Generator produces a Shard, THE Shard_Generator SHALL persist the Shard image data and its association to the source Reflections in durable storage.
3. WHEN the Mosaic_Renderer initializes, THE Mosaic_Renderer SHALL load all persisted Shards and Gold_Threads from storage and reconstruct the Mosaic with the correct layering order.
4. THE Spreadsheet_Parser SHALL persist a record of processed Spreadsheet row identifiers to durable storage so that reprocessing is avoided after a system restart.
5. IF the connection to durable storage is unavailable, THEN THE Spreadsheet_Parser SHALL pause processing and log an error indicating the system is temporarily unable to import new submissions.
6. THE Connection_Analyzer SHALL persist all generated Poetic_Connections and their associated Shard pairs to durable storage.

### Requirement 9: Screen Imported Reflections for Content Safety

**User Story:** As an installation operator, I want reflections imported from the Google Spreadsheet to be screened for harmful content, so that the installation remains a safe and respectful space for all visitors.

#### Acceptance Criteria

1. WHEN the Spreadsheet_Parser imports a new entry, THE Spreadsheet_Parser SHALL screen all three Reflections for harmful, abusive, or inappropriate content before forwarding to the Shard_Generator.
2. IF a Reflection is flagged as harmful, THEN THE Spreadsheet_Parser SHALL skip the entry, log the flagged content for operator review, and mark the row as rejected.
3. THE Spreadsheet_Parser SHALL complete content screening within 3 seconds per entry.
