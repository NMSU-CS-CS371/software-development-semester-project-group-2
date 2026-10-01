// tools/NMSUMapScraper.java — copies NMSU's building facts, descriptions, links and photos
// into our data files.
//
//   java -cp tools/gson-2.11.0.jar tools/NMSUMapScraper.java "Jett Hall"      one place, by the name on map.nmsu.edu
//   java -cp tools/gson-2.11.0.jar tools/NMSUMapScraper.java -all buildings   every building
//   java -cp tools/gson-2.11.0.jar tools/NMSUMapScraper.java -all parks       every park
//   java -cp tools/gson-2.11.0.jar tools/NMSUMapScraper.java -all lots        every parking lot
//   java -cp tools/gson-2.11.0.jar tools/NMSUMapScraper.java -r "Jett Hall"   take one back out of our files
//   java -cp tools/gson-2.11.0.jar tools/NMSUMapScraper.java -kinds           list NMSU's category ids
//
// Run it from the repo root. It ADDS to data/buildings.geojson and data/descriptions.json:
// anything already in those files that it didn't fetch is kept exactly as it was.
//
// SOURCES: NMSU Office of Space Planning (ArcGIS) for the facts; NMSU's campus map
//          (map.nmsu.edu, run by Concept3D) for the description, the links and the photos.
// POLITE : one request at a time, 4-9 second pauses, honest User-Agent, and every record is
//          cached in data/source/nmsu-map-locations.json so NMSU is asked for it exactly once.
//          Commit that cache. Do not delete it to "get fresh data".
import com.google.gson.*;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.*;

public class NMSUMapScraper {

  static final String KEY = "0001085cc708b9cef47080f064612ca5"; // the public key NMSU's own map page sends
  static final String LIST = "https://api.concept3d.com/locations?map=1888&key=" + KEY;
  static final String CATEGORIES = "https://api.concept3d.com/categories/?map=1888&key=" + KEY;
  static final String RECORD = "https://api.concept3d.com/locations/%s?map=1888&key=" + KEY;
  static final String PAGE = "https://map.nmsu.edu/?id=1888#!m/%s";
  // NMSU's image server. It sends about twice the width asked for, for sharp phone screens.
  static final String PHOTO = "https://cms.concept3d.com/map/lib/image-cache/i.php?mapId=1888&image=%s&w=%d&h=%d&r=1";
  static final String ARCGIS = "https://services6.arcgis.com/r7ZUBDL24w5VsBnN/arcgis/rest/services/"
      + "buildings_642026_WFL1/FeatureServer/9/query";
  static final String AGENT = "BetterNMSUMaps/1.0 (NMSU CS 371 student project; one request at a time)";
  static final String REGISTRAR = "NMSU Registrar building abbreviations (records.nmsu.edu)";
  static final String SPACE_PLANNING = "NMSU Space Planning";
  static final String MAP_SOURCE = "NMSU's official campus map (map.nmsu.edu)";

  static final Path BUILDINGS_FILE = Paths.get("data", "buildings.geojson");
  static final Path DESCRIPTIONS_FILE = Paths.get("data", "descriptions.json");
  static final Path CACHE_FILE = Paths.get("data", "source", "nmsu-map-locations.json");

  // Which of NMSU's own map categories each kind means. A category's children count too,
  // so "buildings" covers Academic & Research, Libraries & Museums, Housing and the rest.
  // Run "-kinds" to see every category NMSU has, and add more kinds here.
  static final Map<String, String> KINDS = Map.of(
      "buildings", "Buildings",
      "parks", "Outdoor Spaces",
      "lots", "Parking");

  static final int SAME_PLACE_METRES = 120; // a map point this close, with the same name, is that building
  static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
  static JsonObject cache = new JsonObject();
  static long lastRequest = 0;

  public static void main(String[] args) throws Exception {
    if (args.length == 0) { usage(); return; }

    // "-force" may be anywhere in the command; take it out, and what's left is the name or the kind.
    boolean force = false;
    List<String> words = new ArrayList<>();
    for (String word : args) {
      if (word.equalsIgnoreCase("-force")) force = true;
      else words.add(word);
    }
    args = words.toArray(new String[0]);
    if (args.length == 0) { usage(); return; }

    // Taking a place out only touches our own two files, so it never asks NMSU anything.
    if (args[0].equals("-r") || args[0].equals("-remove")) {
      if (args.length < 2) { usage(); return; }
      remove(String.join(" ", Arrays.copyOfRange(args, 1, args.length)).trim());
      return;
    }

    loadCache();
    JsonArray places = mapPlaces();                 // every place on NMSU's map (one request, then cached)

    List<JsonObject> wanted = new ArrayList<>();
    if (args[0].equals("-kinds")) { printKinds(places); return; }
    if (args[0].equals("-all")) {
      if (args.length < 2) { usage(); return; }
      wanted = ofKind(places, args[1]);
      if (wanted.isEmpty()) {
        System.out.println("No places of kind '" + args[1] + "'. Run -kinds and fill in the category ids at the top.");
        return;
      }
      System.out.println(wanted.size() + " place(s) to copy. About "
          + Math.round(wanted.size() * 6.5 / 60) + " minute(s); Ctrl-C is safe, it carries on where it stopped.");
    } else {
      String name = String.join(" ", args).replaceFirst("^-", "").trim();
      JsonObject found = byName(places, name);
      if (found == null) { suggest(places, name); return; }
      wanted.add(found);
    }

    Map<String, JsonObject> official = spacePlanningRecords();  // facts, by property number (one request)
    JsonObject buildingsFile = readOrStart(BUILDINGS_FILE, "buildings");
    JsonObject descriptionsFile = readOrStart(DESCRIPTIONS_FILE, "descriptions");
    int added = 0;
    int upToDate = 0;
    int keptByHand = 0;
    int markedHuman = 0;

    for (JsonObject place : wanted) {
      String mapId = place.get("id").getAsString();
      String name = str(place, "name");
      JsonObject record = matchOfficial(official, place);     // null for a park or a lot
      String id = record != null ? str(record, "Property") : "c3d-" + mapId;

      // What we already have, if anything.
      JsonObject haveEntry = existing(buildingsFile.getAsJsonArray("buildings"), id);
      JsonElement haveAbout = descriptionsFile.getAsJsonObject("descriptions").get(id);

      // Has a person edited this since the scraper last wrote it? The entry carries a short
      // fingerprint of what the scraper wrote; if the building (or its description) no longer
      // matches that fingerprint, somebody changed it by hand. We record that and back off.
      if (haveEntry != null && editedByHand(haveEntry, haveAbout)
          && !"human".equals(str(haveEntry, "lastInputSource"))) {
        haveEntry.addProperty("lastInputSource", "human");
        haveEntry.addProperty("dateUpdated", today());
        if (!haveEntry.has("dateAdded")) haveEntry.addProperty("dateAdded", today());
        markedHuman++;
      }

      // Whatever a person last wrote wins, and we don't even ask NMSU about it.
      // "-force" is how you deliberately take NMSU's version back.
      if (haveEntry != null && "human".equals(str(haveEntry, "lastInputSource")) && !force) {
        System.out.println("  " + name + "  last changed by hand, kept (use -force to take NMSU's version)");
        keptByHand++;
        continue;
      }

      // The name first, then dots while we wait for NMSU, then what we got.
      step("  " + name);
      JsonObject entry = building(id, name, mapId, record, place, categoryOf(place));
      JsonObject about = describe(mapId, force); // from the cache, or asked for again with -force

      // Nothing has changed at NMSU: leave both files exactly as they are.
      if (haveEntry != null && content(haveEntry).equals(content(entry))
          && Objects.equals(haveAbout, (JsonElement) about)) {
        done(id + "  already up to date");
        upToDate++;
        continue;
      }

      List<String> changes = changedFields(haveEntry, entry, haveAbout, about);
      String addedOn = haveEntry != null && haveEntry.has("dateAdded") ? str(haveEntry, "dateAdded") : today();
      putBuilding(buildingsFile.getAsJsonArray("buildings"), withHistory(entry, about, addedOn));
      if (about != null) descriptionsFile.getAsJsonObject("descriptions").add(id, about);
      done(id + (haveEntry == null ? "  new" : "  updated: " + String.join(", ", changes))
          + (about == null ? "  (no description on NMSU's map)" : "")
          + (record == null ? "  (no Space Planning record: facts left empty)" : ""));
      added++;
    }

    if (added > 0 || markedHuman > 0) {
      write(BUILDINGS_FILE, buildingsFile);
      write(DESCRIPTIONS_FILE, descriptionsFile);
    }
    System.out.println(added + " written"
        + (upToDate > 0 ? ", " + upToDate + " already up to date" : "")
        + (keptByHand > 0 ? ", " + keptByHand + " kept as a person left them" : "")
        + (markedHuman > 0 ? ", " + markedHuman + " newly marked \"human\"" : ""));
    if (added > 0 || markedHuman > 0) {
      System.out.println("Check `git diff data/` before you commit, so you can see exactly what changed.");
    }
  }

  /**
   * What we already have for this place in data/buildings.geojson, or null.
   * @param buildings the "buildings" list from the file
   * @param id the place's id
   */
  static JsonObject existing(JsonArray buildings, String id) {
    for (JsonElement element : buildings) {
      JsonObject entry = element.getAsJsonObject();
      if (entry.getAsJsonObject("properties").get("id").getAsString().equals(id)) return entry;
    }
    return null;
  }

  /* ---------- who last wrote each building, and when ----------
     Every building carries three things a person can read:
       dateAdded        the day it first went into our files
       dateUpdated      the day it last changed
       lastInputSource  "scraper" (copied from NMSU) or "human" (one of us wrote it)
     plus scraperStamp, a short fingerprint of exactly what the scraper wrote. When the
     building no longer matches its fingerprint, a person has edited it, so the scraper
     marks it "human" and stops overwriting it. Nobody has to remember to set a flag. */

  /** The bookkeeping fields, which are ours, not NMSU's. */
  static final String[] HISTORY = {"dateAdded", "dateUpdated", "lastInputSource", "scraperStamp"};

  /** Today, as 2026-09-30. */
  static String today() {
    return LocalDate.now().toString();
  }

  /**
   * One building's actual content: everything except our own bookkeeping, so comparing two
   * buildings isn't thrown off by the dates.
   */
  static JsonObject content(JsonObject entry) {
    JsonObject copy = entry.deepCopy();
    for (String field : HISTORY) {
      copy.remove(field);
    }
    return copy;
  }

  /**
   * A short fingerprint of a building and its description, exactly as the scraper wrote them.
   * The same input always gives the same eight characters; any change gives a different eight.
   */
  static String fingerprint(JsonObject entry, JsonElement about) throws Exception {
    String text = GSON.toJson(content(entry)) + "|" + (about == null ? "" : GSON.toJson(about));
    byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
    StringBuilder eight = new StringBuilder();
    for (int index = 0; index < 4; index += 1) {
      eight.append(String.format("%02x", digest[index]));
    }
    return eight.toString();
  }

  /**
   * Has a person changed this building (or its description) since the scraper wrote it?
   * A building with no fingerprint was written by hand in the first place, so yes.
   */
  static boolean editedByHand(JsonObject had, JsonElement hadAbout) throws Exception {
    String written = str(had, "scraperStamp");
    return written.isEmpty() || !written.equals(fingerprint(had, hadAbout));
  }

  /**
   * A building with its bookkeeping filled in and put first, so you can see at a glance
   * where it came from and when.
   * @param addedOn the day it first went into our files
   */
  static JsonObject withHistory(JsonObject entry, JsonObject about, String addedOn) throws Exception {
    JsonObject full = new JsonObject();
    full.addProperty("dateAdded", addedOn);
    full.addProperty("dateUpdated", today());
    full.addProperty("lastInputSource", "scraper");
    full.addProperty("scraperStamp", fingerprint(entry, about));
    for (String field : entry.keySet()) { // type, properties, geometry
      full.add(field, entry.get(field));
    }
    return full;
  }

  /**
   * Which fields are different between what we have and what NMSU says now, so the run
   * prints what it changed instead of changing things quietly.
   * @returns a list like ["built", "floors", "description"]
   */
  static List<String> changedFields(JsonObject had, JsonObject now, JsonElement hadAbout, JsonElement nowAbout) {
    List<String> changes = new ArrayList<>();
    if (had != null) {
      JsonObject before = had.getAsJsonObject("properties");
      JsonObject after = now.getAsJsonObject("properties");
      for (String field : after.keySet()) {
        if (!Objects.equals(before.get(field), after.get(field))) changes.add(field);
      }
      if (!Objects.equals(had.get("geometry"), now.get("geometry"))) changes.add("position");
    }
    if (!Objects.equals(hadAbout, (JsonElement) nowAbout)) changes.add("description");
    if (changes.isEmpty()) changes.add("nothing"); // shouldn't happen: we only get here when something differs
    return changes;
  }

  /* ---------- taking a place out of our files ---------- */

  /**
   * Take one place out of data/buildings.geojson and data/descriptions.json.
   * Matched on the name we show, or on its id, ignoring case and punctuation.
   * Nothing is downloaded: this only edits the two files we keep.
   * @param wanted the name (or id) typed on the command line
   */
  static void remove(String wanted) throws Exception {
    JsonObject buildingsFile = readOrStart(BUILDINGS_FILE, "buildings");
    JsonObject descriptionsFile = readOrStart(DESCRIPTIONS_FILE, "descriptions");
    JsonArray buildings = buildingsFile.getAsJsonArray("buildings");

    JsonObject found = null;
    int at = -1;
    for (int index = 0; index < buildings.size(); index += 1) {
      JsonObject properties = buildings.get(index).getAsJsonObject().getAsJsonObject("properties");
      if (simpleName(str(properties, "name")).equals(simpleName(wanted))
          || str(properties, "id").equalsIgnoreCase(wanted)) {
        found = buildings.get(index).getAsJsonObject();
        at = index;
        break;
      }
    }

    if (found == null) {
      System.out.println("\"" + wanted + "\" is not in data/buildings.geojson.");
      suggestOurs(buildings, wanted);
      return;
    }

    String id = str(found.getAsJsonObject("properties"), "id");
    String name = str(found.getAsJsonObject("properties"), "name");
    boolean hadDescription = descriptionsFile.getAsJsonObject("descriptions").has(id);
    boolean byHand = "human".equals(str(found, "lastInputSource"));

    buildings.remove(at);
    descriptionsFile.getAsJsonObject("descriptions").remove(id);
    write(BUILDINGS_FILE, buildingsFile);
    write(DESCRIPTIONS_FILE, descriptionsFile);

    System.out.println("Removed " + name + " (id " + id + ") from data/buildings.geojson"
        + (hadDescription ? " and data/descriptions.json" : ""));
    if (byHand) {
      System.out.println("That one was last written by hand, so whatever we wrote about it is gone too.");
    }
    System.out.println("`git diff data/` shows what went, and `git checkout data/` puts it back.");
  }

  /**
   * The place isn't in our files: list the closest names we do have, so a typo is obvious.
   * @param buildings the "buildings" list from data/buildings.geojson
   * @param wanted what was typed
   */
  static void suggestOurs(JsonArray buildings, String wanted) {
    List<String> near = new ArrayList<>();
    String typed = simpleName(wanted);
    for (JsonElement element : buildings) {
      String name = str(element.getAsJsonObject().getAsJsonObject("properties"), "name");
      String theirs = simpleName(name);
      if (theirs.isEmpty() || typed.isEmpty()) continue;
      if (theirs.contains(typed) || typed.contains(theirs)
          || editDistance(typed, theirs) <= Math.max(2, typed.length() / 5)) near.add(name);
    }
    if (near.isEmpty()) {
      System.out.println("We have " + buildings.size() + " building(s). Run with no arguments to see the commands.");
    } else {
      System.out.println("Did you mean:");
      for (String option : near) System.out.println("   " + option);
    }
  }

  /* ---------- finding a place ---------- */

  /**
   * Every place on NMSU's campus map: id, name, lat, lng, catId.
   * NMSU also sends each place's outline, which we don't use, so only these five fields are
   * kept: the saved list is about 400 KB instead of nearly 4 MB.
   */
  static JsonArray mapPlaces() throws Exception {
    if (!cache.has("__list__")) {
      step("Reading NMSU's list of places (once; after this it's saved)");
      JsonArray small = new JsonArray();
      for (JsonElement element : json(LIST).getAsJsonArray()) {
        JsonObject place = element.getAsJsonObject();
        JsonObject kept = new JsonObject();
        for (String field : new String[] {"id", "name", "lat", "lng", "catId"}) {
          if (place.has(field)) kept.add(field, place.get(field));
        }
        small.add(kept);
      }
      cache.add("__list__", small);
      saveCache();
      done(small.size() + " places");
    }
    return cache.getAsJsonArray("__list__");
  }

  /**
   * The place whose name matches what was typed, ignoring case, spaces and punctuation.
   * NMSU lists the same place in several categories (Jett Hall is under Academic & Research
   * and again under ADA Accessible Buildings), so the building entry is preferred.
   */
  static JsonObject byName(JsonArray places, String name) throws Exception {
    List<JsonObject> matches = new ArrayList<>();
    for (JsonElement element : places) {
      JsonObject place = element.getAsJsonObject();
      if (simpleName(str(place, "name")).equals(simpleName(name))) matches.add(place);
    }
    if (matches.isEmpty()) return null;
    for (String kind : new String[] {"buildings", "parks", "lots"}) {
      Set<Integer> wanted = catsUnder(KINDS.get(kind));
      for (JsonObject place : matches) {
        if (place.has("catId") && wanted.contains(place.get("catId").getAsInt())) return place;
      }
    }
    return matches.get(0);
  }

  /** Not found: say so, and list anything close, so a typo is obvious. */
  static void suggest(JsonArray places, String name) {
    System.out.println("\"" + name + "\" is not on NMSU's campus map.");
    List<String> near = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    String typed = simpleName(name);
    for (JsonElement element : places) {
      String other = str(element.getAsJsonObject(), "name");
      String theirs = simpleName(other);
      if (typed.isEmpty() || theirs.isEmpty() || near.size() >= 8) continue;
      boolean close = theirs.contains(typed) || typed.contains(theirs)
          || editDistance(typed, theirs) <= Math.max(2, typed.length() / 5); // a typo or two
      if (close && seen.add(theirs)) near.add(other);
    }
    if (near.isEmpty()) System.out.println("Nothing similar. Copy the name exactly as map.nmsu.edu shows it.");
    else { System.out.println("Did you mean:"); for (String option : near) System.out.println("   " + option); }
  }

  /** Every place of one kind, with NMSU's repeats (same place in several categories) removed. */
  static List<JsonObject> ofKind(JsonArray places, String kind) throws Exception {
    String category = KINDS.get(kind.toLowerCase());
    if (category == null) return new ArrayList<>();
    Set<Integer> wanted = catsUnder(category);
    List<JsonObject> found = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    for (JsonElement element : places) {
      JsonObject place = element.getAsJsonObject();
      if (!place.has("catId") || place.get("catId").isJsonNull()) continue;
      if (!wanted.contains(place.get("catId").getAsInt())) continue;
      if (seen.add(simpleName(str(place, "name")))) found.add(place);
    }
    return found;
  }

  /** NMSU's own category list (one request, then cached). */
  static JsonArray categories() throws Exception {
    if (!cache.has("__cats__")) {
      step("Reading NMSU's categories (once; after this it's saved)");
      cache.add("__cats__", json(CATEGORIES));
      saveCache();
      done(cache.getAsJsonArray("__cats__").size() + " categories");
    }
    return cache.getAsJsonArray("__cats__");
  }

  /** The ids of one NMSU category and everything under it, by the name NMSU gives it. */
  static Set<Integer> catsUnder(String categoryName) throws Exception {
    Set<Integer> wanted = new HashSet<>();
    for (JsonElement element : categories()) {
      JsonObject category = element.getAsJsonObject();
      if (str(category, "name").equalsIgnoreCase(categoryName)) wanted.add(category.get("catId").getAsInt());
    }
    // Add children, then their children, until nothing new turns up.
    boolean grew = true;
    while (grew) {
      grew = false;
      for (JsonElement element : categories()) {
        JsonObject category = element.getAsJsonObject();
        int id = category.get("catId").getAsInt();
        int parent = category.get("parent").getAsInt();
        if (wanted.contains(parent) && wanted.add(id)) grew = true;
      }
    }
    return wanted;
  }

  /** Print NMSU's categories with how many places are in each, so new kinds can be added above. */
  static void printKinds(JsonArray places) throws Exception {
    Map<Integer, Integer> counts = new HashMap<>();
    for (JsonElement element : places) {
      JsonObject place = element.getAsJsonObject();
      if (!place.has("catId") || place.get("catId").isJsonNull()) continue;
      counts.merge(place.get("catId").getAsInt(), 1, Integer::sum);
    }
    Map<Integer, String> names = new HashMap<>();
    for (JsonElement element : categories()) {
      JsonObject category = element.getAsJsonObject();
      names.put(category.get("catId").getAsInt(), str(category, "name"));
    }
    for (JsonElement element : categories()) {
      JsonObject category = element.getAsJsonObject();
      int id = category.get("catId").getAsInt();
      int parent = category.get("parent").getAsInt();
      String under = parent == 0 ? "" : "   (under " + names.getOrDefault(parent, "?") + ")";
      System.out.println(String.format("%-8d %-45s %4d places%s",
          id, str(category, "name"), counts.getOrDefault(id, 0), under));
    }
    System.out.println("\nKinds you can use with -all right now:");
    for (Map.Entry<String, String> kind : new TreeMap<>(KINDS).entrySet()) {
      System.out.println("   -all " + kind.getKey() + "   = NMSU's \"" + kind.getValue()
          + "\" category and everything under it (" + ofKind(places, kind.getKey()).size() + " places)");
    }
  }

  /* ---------- NMSU Space Planning (the facts) ---------- */

  /** Every Las Cruces building NMSU's records list, by property number. One request. */
  static Map<String, JsonObject> spacePlanningRecords() throws Exception {
    String url = ARCGIS + "?where=" + encode("Campus='LAS CRUCES'")
        + "&outFields=Property,Descriptio,Address_1,Address_2,Zip_Code,DateBuilt,Property_C,Longitude,Latitude"
        + "&returnGeometry=false&f=json";
    step("Reading NMSU Space Planning's building records");
    Map<String, JsonObject> records = new LinkedHashMap<>();
    for (JsonElement row : json(url).getAsJsonObject().getAsJsonArray("features")) {
      JsonObject attributes = row.getAsJsonObject().getAsJsonObject("attributes");
      records.putIfAbsent(str(attributes, "Property"), attributes); // one row per house for some properties
    }
    done(records.size() + " buildings");
    return records;
  }

  /** NMSU's official record for a map place: same name, and close enough to be the same place. */
  static JsonObject matchOfficial(Map<String, JsonObject> official, JsonObject place) {
    if (!place.has("lat") || !place.has("lng")) return null;
    double lat = place.get("lat").getAsDouble(), lng = place.get("lng").getAsDouble();
    String wanted = simpleName(str(place, "name"));
    JsonObject nearest = null;
    double nearestMetres = SAME_PLACE_METRES;
    for (JsonObject record : official.values()) {
      if (record.get("Latitude") == null || record.get("Latitude").isJsonNull()) continue;
      double apart = metresApart(lat, lng, record.get("Latitude").getAsDouble(), record.get("Longitude").getAsDouble());
      if (apart > nearestMetres) continue;
      String theirs = simpleName(str(record, "Descriptio"));
      // Same name, or one name inside the other ("Jett Hall" / "Jett Hall Annex").
      if (theirs.equals(wanted) || theirs.contains(wanted) || wanted.contains(theirs)) {
        nearest = record;
        nearestMetres = apart;
      }
    }
    return nearest; // null for a park or a lot: no Space Planning building record
  }

  /* ---------- writing our two files ---------- */

  /** Which of our categories a place belongs to, from the NMSU category it is listed under. */
  static String categoryOf(JsonObject place) throws Exception {
    if (place.has("catId") && !place.get("catId").isJsonNull()) {
      int catId = place.get("catId").getAsInt();
      if (catsUnder(KINDS.get("parks")).contains(catId)) return "park";
      if (catsUnder(KINDS.get("lots")).contains(catId)) return "parking";
    }
    return "study";
  }

  /** One entry for data/buildings.geojson, in the shape our file already uses. */
  static JsonObject building(String id, String name, String mapId, JsonObject record, JsonObject place,
                             String category) {
    JsonObject p = new JsonObject();
    p.addProperty("id", id);
    p.addProperty("code", record != null ? str(record, "Address_2") : "");
    p.addProperty("name", name);
    p.addProperty("address", record != null
        ? tidyAddress(str(record, "Address_1")) + ", Las Cruces, NM " + str(record, "Zip_Code") : "");
    p.addProperty("propertyNumber", record != null ? str(record, "Property") : "");
    p.addProperty("built", record != null ? year(str(record, "DateBuilt")) : "");
    p.addProperty("builtSource", record != null && !year(str(record, "DateBuilt")).isEmpty() ? SPACE_PLANNING : "");
    // NMSU writes the number of floors inside the property class ("ACADEMIC - 2 STORY").
    // When it isn't there, say so instead of pretending NMSU told us it has one floor.
    String propertyClass = record == null ? "" : str(record, "Property_C");
    boolean storiesKnown = Pattern.compile("(\\d+)\\s*STORY").matcher(propertyClass).find();
    p.add("floors", GSON.toJsonTree(floors(propertyClass)));
    p.addProperty("floorsSource", storiesKnown ? SPACE_PLANNING : "Not published by NMSU (ground floor assumed)");
    p.addProperty("category", category);
    p.addProperty("nmsuUrl", String.format(PAGE, mapId));
    p.addProperty("source", record != null
        ? "NMSU Office of Space Planning, Buildings layer (property " + str(record, "Property") + ")"
        : MAP_SOURCE);
    p.addProperty("codeSource", record != null && !str(record, "Address_2").isEmpty()
        ? REGISTRAR : "Not listed by the NMSU Registrar");

    JsonArray point = new JsonArray();
    point.add(record != null ? record.get("Longitude").getAsDouble() : place.get("lng").getAsDouble());
    point.add(record != null ? record.get("Latitude").getAsDouble() : place.get("lat").getAsDouble());
    JsonObject geometry = new JsonObject();
    geometry.addProperty("type", "Point");
    geometry.add("coordinates", point);

    JsonObject entry = new JsonObject();
    entry.addProperty("type", "Building");
    entry.add("properties", p);
    entry.add("geometry", geometry);
    return entry;
  }

  /** Replace the building with this id, or add it to the end. Everything else is left alone. */
  static void putBuilding(JsonArray buildings, JsonObject entry) {
    String id = entry.getAsJsonObject("properties").get("id").getAsString();
    for (int index = 0; index < buildings.size(); index++) {
      JsonObject existing = buildings.get(index).getAsJsonObject();
      if (existing.getAsJsonObject("properties").get("id").getAsString().equals(id)) {
        buildings.set(index, entry);
        return;
      }
    }
    buildings.add(entry);
  }

  /**
   * One entry for data/descriptions.json: { paragraphs, links, photos, source }.
   * @param mapId the place's id on NMSU's map
   * @param force true = ask NMSU again even though we have this page saved, so a description
   *              NMSU has since rewritten comes through. Without it the saved copy is used.
   */
  static JsonObject describe(String mapId, boolean force) throws Exception {
    if (force) cache.remove(mapId); // drop the saved copy so the line below downloads it again
    if (!cache.has(mapId)) {
      JsonElement page = json(String.format(RECORD, mapId));
      JsonObject saved = new JsonObject();
      if (page != null && page.isJsonObject()) {
        JsonObject record = page.getAsJsonObject();
        saved.addProperty("name", str(record, "name"));
        saved.addProperty("description", str(record, "description"));
        saved.add("mediaUrls", record.has("mediaUrls") ? record.get("mediaUrls") : new JsonArray());
        saved.add("mediaTitles", record.has("mediaTitles") ? record.get("mediaTitles") : new JsonArray());
        saved.addProperty("fetchedOn", LocalDate.now().toString());
      }
      cache.add(mapId, saved);
      saveCache(); // after every record, so stopping the run loses nothing
    }
    JsonObject record = cache.getAsJsonObject(mapId);
    String html = str(record, "description");
    List<String> paragraphs = toParagraphs(html);
    JsonArray links = linksIn(html);
    JsonArray photos = photosIn(record, mapId);
    if (paragraphs.isEmpty() && links.size() == 0 && photos.size() == 0) return null;

    JsonObject about = new JsonObject();
    about.add("paragraphs", GSON.toJsonTree(paragraphs));
    if (links.size() > 0) about.add("links", links);
    if (photos.size() > 0) about.add("photos", photos);
    about.addProperty("source", MAP_SOURCE);
    return about;
  }

  /* ---------- the text work (pure: this is what the JUnit tests cover) ---------- */

  /** NMSU's description HTML turned into clean paragraphs. */
  static List<String> toParagraphs(String html) {
    String text = unescape(html.replaceAll("(?i)<br\\s*/?>|</p>|</li>|</h\\d>", "\n").replaceAll("<[^>]+>", ""));
    List<String> paragraphs = new ArrayList<>();
    for (String raw : text.split("\n")) {
      String line = raw.replaceAll("[ \t]+", " ").trim().replaceAll(" ([.,;:!?])", "$1");
      if (line.isEmpty()) continue;
      int last = paragraphs.size() - 1;
      // NMSU sometimes breaks one sentence over two lines: join them back together.
      if (last >= 0 && Character.isLowerCase(line.charAt(0))
          && !paragraphs.get(last).matches(".*[.!?:\"”)]$")) {
        paragraphs.set(last, paragraphs.get(last) + " " + line);
      } else {
        paragraphs.add(line);
      }
    }
    // NMSU ends most descriptions with a list of links. Those come out as their own
    // paragraphs ("KRWG Radio,"), and we already keep them properly in "links", so drop them here.
    Set<String> linkLabels = allLinkLabels(html);
    paragraphs.removeIf(line -> linkLabels.contains(simpleName(line)));

    // The last lines repeat the address, code and property number the page already shows as facts.
    String[] footers = {"Property: \\S+", "[A-Z .]+, NM,? \\d{5}", "[A-Z0-9]{1,8}",
        "\\d[\\dA-Z-]* [A-Z0-9 .#&'/-]+", "Building monitor information can be found here\\.?"};
    boolean dropped = true;
    while (dropped && !paragraphs.isEmpty()) {
      dropped = false;
      for (String pattern : footers) {
        if (Pattern.matches(pattern, paragraphs.get(paragraphs.size() - 1))) {
          paragraphs.remove(paragraphs.size() - 1);
          dropped = true;
          break;
        }
      }
    }
    return paragraphs;
  }

  // How street words are written, so every address looks the same. Only the look changes:
  // "2915 MCFIE CIR." and "2915 McFie Circle" are the same place, shown as "2915 McFie Cir.".
  static final Map<String, String> STREET_WORDS = Map.ofEntries(
      Map.entry("north", "N."), Map.entry("n", "N."), Map.entry("south", "S."), Map.entry("s", "S."),
      Map.entry("east", "E."), Map.entry("e", "E."), Map.entry("west", "W."), Map.entry("w", "W."),
      Map.entry("street", "St."), Map.entry("st", "St."), Map.entry("avenue", "Ave."), Map.entry("ave", "Ave."),
      Map.entry("drive", "Dr."), Map.entry("dr", "Dr."), Map.entry("road", "Rd."), Map.entry("rd", "Rd."),
      Map.entry("circle", "Cir."), Map.entry("cir", "Cir."), Map.entry("place", "Pl."), Map.entry("pl", "Pl."),
      Map.entry("mcfie", "McFie"));

  /** "2915 MCFIE CIR." -> "2915 McFie Cir.". NMSU writes addresses in capitals. */
  static String tidyAddress(String street) {
    List<String> words = new ArrayList<>();
    for (String word : street.trim().split("\\s+")) {
      if (word.isEmpty()) continue;
      String plain = word.toLowerCase().replace(".", "").replace(",", "");
      if (STREET_WORDS.containsKey(plain)) {
        words.add(STREET_WORDS.get(plain));
      } else if (word.matches(".*\\d.*")) {
        words.add(word); // house numbers and things like "1-B" stay as they are
      } else {
        words.add(word.substring(0, 1).toUpperCase() + word.substring(1).toLowerCase());
      }
    }
    return String.join(" ", words);
  }

  /**
   * The words of every link in the description, simplified for comparing.
   * Every anchor counts, even ones linksIn() leaves out (two links to the same page),
   * because the words still have to come out of the paragraphs.
   */
  static Set<String> allLinkLabels(String html) {
    Set<String> labels = new HashSet<>();
    Matcher anchor = Pattern.compile("(?is)<a[^>]*>(.*?)</a>").matcher(html);
    while (anchor.find()) {
      String label = simpleName(unescape(anchor.group(1).replaceAll("<[^>]+>", "")));
      if (!label.isEmpty()) labels.add(label);
    }
    return labels;
  }

  /** The links inside NMSU's description, as { label, url }. Only https links are kept. */
  static JsonArray linksIn(String html) {
    JsonArray links = new JsonArray();
    Set<String> seen = new HashSet<>();
    Matcher anchor = Pattern.compile("(?is)<a[^>]+href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>").matcher(html);
    while (anchor.find()) {
      String url = anchor.group(1).trim();
      String label = unescape(anchor.group(2).replaceAll("<[^>]+>", "")).trim();
      if (url.startsWith("http://")) url = "https://" + url.substring("http://".length());
      if (!url.startsWith("https://") || label.isEmpty() || !seen.add(url)) continue;
      if (label.matches("(?i)here|click here|this website|link|website")) label = labelFromUrl(url);
      JsonObject link = new JsonObject();
      link.addProperty("label", label);
      link.addProperty("url", url);
      links.add(link);
    }
    return links;
  }

  /**
   * A readable label for a link whose words were only "here": the last part of its address.
   * "https://inside.nmsu.edu/facilities/building-monitors/" -> "Building Monitors".
   */
  static String labelFromUrl(String url) {
    String path = url.replaceFirst("^https://[^/]+", "").replaceAll("[/#?].*$|^/", "");
    String[] parts = url.replaceFirst("^https://", "").split("[/#?]");
    for (int index = parts.length - 1; index > 0; index--) {
      if (!parts[index].isEmpty()) { path = parts[index]; break; }
    }
    if (path.isEmpty()) return url.replaceFirst("^https://", "").replaceAll("/.*$", ""); // just the site name
    String words = path.replaceAll("\\.[a-z]+$", "").replace('-', ' ').replace('_', ' ').trim();
    StringBuilder label = new StringBuilder();
    for (String word : words.split("\\s+")) {
      if (word.isEmpty()) continue;
      if (label.length() > 0) label.append(' ');
      label.append(word.substring(0, 1).toUpperCase()).append(word.substring(1));
    }
    return label.toString();
  }

  /** The photos on NMSU's page for this place: a big one and a small one for each. */
  static JsonArray photosIn(JsonObject record, String mapId) {
    JsonArray photos = new JsonArray();
    if (!record.has("mediaUrls") || record.get("mediaUrls").isJsonNull()) return photos;
    JsonArray files = record.getAsJsonArray("mediaUrls");
    JsonArray titles = record.has("mediaTitles") && record.get("mediaTitles").isJsonArray()
        ? record.getAsJsonArray("mediaTitles") : new JsonArray();
    for (int index = 0; index < files.size(); index++) {
      String file = files.get(index).getAsString();
      if (!file.matches("(?i).*\\.(jpe?g|png|gif|webp)$")) continue; // videos and PDFs are not photos
      JsonObject photo = new JsonObject();
      photo.addProperty("title", index < titles.size() ? titles.get(index).getAsString() : "");
      photo.addProperty("url", String.format(PHOTO, encode(file), 800, 533));
      photo.addProperty("thumbUrl", String.format(PHOTO, encode(file), 320, 213));
      photo.addProperty("sourceUrl", String.format(PAGE, mapId));
      photos.add(photo);
    }
    return photos;
  }

  /** Turn the codes web pages use back into real characters: "&amp;" -> "&". */
  static String unescape(String text) {
    return text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"")
               .replace("&#39;", "'").replace("&rsquo;", "'").replace("&lsquo;", "'")
               .replace("&ldquo;", "\"").replace("&rdquo;", "\"").replace("&ndash;", "-")
               .replace("&nbsp;", " ").replace("\r", "").replace(" ", " ");
  }

  /**
   * How many single-letter changes turn one word into the other ("jethall" -> "jetthall" is 1).
   * Used only to suggest names after a typo.
   */
  static int editDistance(String first, String second) {
    int[] row = new int[second.length() + 1];
    for (int column = 0; column <= second.length(); column++) row[column] = column;
    for (int index = 1; index <= first.length(); index++) {
      int corner = row[0]; // the value diagonally up-left, before this row overwrites it
      row[0] = index;
      for (int column = 1; column <= second.length(); column++) {
        int above = row[column];
        int change = first.charAt(index - 1) == second.charAt(column - 1) ? 0 : 1;
        row[column] = Math.min(Math.min(row[column] + 1, row[column - 1] + 1), corner + change);
        corner = above;
      }
    }
    return row[second.length()];
  }

  /** A name with nothing but lowercase letters and numbers, so "Jett Hall" == "jett  hall". */
  static String simpleName(String name) {
    return name == null ? "" : name.toLowerCase().replaceAll("[^a-z0-9]", "");
  }

  /** "ACADEMIC - 2 STORY" -> [1, 2]. One floor when NMSU doesn't say. */
  static List<Integer> floors(String propertyClass) {
    int stories = 1;
    Matcher found = Pattern.compile("(\\d+)\\s*STORY").matcher(propertyClass == null ? "" : propertyClass);
    if (found.find()) stories = Integer.parseInt(found.group(1));
    List<Integer> list = new ArrayList<>();
    for (int floor = 1; floor <= stories; floor++) list.add(floor);
    return list;
  }

  /** The four-digit year out of whatever NMSU wrote. */
  static String year(String value) {
    Matcher found = Pattern.compile("(\\d{4})").matcher(value == null ? "" : value);
    return found.find() ? found.group(1) : "";
  }

  /** Roughly how far apart two points are, in metres. Good enough to tell two buildings apart. */
  static double metresApart(double lat1, double lng1, double lat2, double lng2) {
    double north = (lat1 - lat2) * 111320;
    double east = (lng1 - lng2) * 111320 * Math.cos(Math.toRadians(lat1));
    return Math.sqrt(north * north + east * east);
  }

  /* ---------- talking to the servers, and the cache ---------- */

  /** Start a line: what we are about to do. The dots from politeSleep() follow it. */
  static void step(String what) {
    System.out.print(what + " ");
    System.out.flush();
  }

  /** Finish the line started by step(), with what we ended up with. */
  static void done(String result) {
    System.out.println(" " + result);
  }

  /** One GET, parsed as JSON. Waits politely first; backs off when the server is busy. */
  static JsonElement json(String url) throws Exception {
    for (int attempt = 1; attempt <= 5; attempt++) {
      // The pause is for NMSU's campus map, which asks automated clients to go easy.
      // Space Planning's ArcGIS service is a public data API built to be queried, and we
      // ask it once per run, so it doesn't need one.
      if (url.contains("concept3d.com")) politeSleep();
      HttpURLConnection connection = (HttpURLConnection) URI.create(url).toURL().openConnection();
      connection.setRequestProperty("User-Agent", AGENT);
      connection.setConnectTimeout(30000);
      connection.setReadTimeout(90000);
      int status;
      String body = "";
      try {
        status = connection.getResponseCode();
        InputStream stream = status < 400 ? connection.getInputStream() : connection.getErrorStream();
        if (stream != null) body = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
      } finally {
        connection.disconnect();
        lastRequest = System.currentTimeMillis();
      }
      if (status == 200) return JsonParser.parseString(body);
      if (status == 404) return null;
      if (status != 429 && status < 500) {
        throw new RuntimeException("NMSU answered " + status + " for " + url);
      }
      long wait = 90L * attempt;
      System.out.println("   server busy (" + status + "), waiting " + wait + "s");
      Thread.sleep(wait * 1000);
    }
    throw new RuntimeException("No answer after 5 tries: " + url);
  }

  /**
   * Never ask faster than a person clicking through the map: 4-9 seconds between requests.
   * Prints a dot every half second, so the wait looks like work instead of a frozen screen.
   */
  static void politeSleep() throws InterruptedException {
    long pause = 4000 + (long) (Math.random() * 5000);
    long left = lastRequest + pause - System.currentTimeMillis();
    while (left > 0) {
      Thread.sleep(Math.min(500, left));
      System.out.print(".");
      System.out.flush(); // without this the dots would all appear at the end, together
      left = lastRequest + pause - System.currentTimeMillis();
    }
  }

  static void loadCache() throws Exception {
    if (!Files.exists(CACHE_FILE)) return;
    JsonObject file = JsonParser.parseString(Files.readString(CACHE_FILE, StandardCharsets.UTF_8)).getAsJsonObject();
    if (file.has("locations")) cache = file.getAsJsonObject("locations");
  }

  static void saveCache() throws Exception {
    JsonObject file = new JsonObject();
    file.add("locations", cache);
    write(CACHE_FILE, file);
  }

  /** Read one of our data files, or start an empty one with the same shape. */
  static JsonObject readOrStart(Path path, String listName) throws Exception {
    if (Files.exists(path)) {
      return JsonParser.parseString(Files.readString(path, StandardCharsets.UTF_8)).getAsJsonObject();
    }
    JsonObject file = new JsonObject();
    if (listName.equals("buildings")) { file.addProperty("type", "Buildings"); file.add("buildings", new JsonArray()); }
    else file.add("descriptions", new JsonObject());
    return file;
  }

  static void write(Path path, JsonObject content) throws Exception {
    if (path.getParent() != null) Files.createDirectories(path.getParent());
    Files.writeString(path, GSON.toJson(content) + "\n", StandardCharsets.UTF_8);
  }

  static String str(JsonObject record, String field) {
    JsonElement value = record.get(field);
    return (value == null || value.isJsonNull()) ? "" : value.getAsString();
  }

  static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }

  static void usage() {
    System.out.println("Run from the repo root:");
    System.out.println("  java -cp tools/gson-2.11.0.jar tools/NMSUMapScraper.java \"Jett Hall\"");
    System.out.println("  java -cp tools/gson-2.11.0.jar tools/NMSUMapScraper.java -all buildings|parks|lots");
    System.out.println("  java -cp tools/gson-2.11.0.jar tools/NMSUMapScraper.java -kinds");
    System.out.println();
    System.out.println("Take a place back out of our files (nothing is downloaded):");
    System.out.println("  java -cp tools/gson-2.11.0.jar tools/NMSUMapScraper.java -r \"Jett Hall\"");
    System.out.println();
    System.out.println("A place we already have is only rewritten when NMSU's information has actually");
    System.out.println("changed, and the run says which fields changed. NMSU's page itself is only");
    System.out.println("downloaded once; add -force to ask for it again and pick up a rewritten description:");
    System.out.println("  java -cp tools/gson-2.11.0.jar tools/NMSUMapScraper.java \"Jett Hall\" -force");
  }
}
