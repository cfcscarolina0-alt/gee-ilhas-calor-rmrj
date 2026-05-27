/ MODIS LST - 8 dias, 1km
// Apenas imagens com >= 70% de pixels válidos

var geometry = ee.FeatureCollection(
  "projects/boreal-fort-463311-r8/assets/shpRMRJ-20250711T015753Z-1-001"
);

// Centralizar mapa
Map.centerObject(geometry, 10);
Map.addLayer(geometry, {color: 'black'}, 'Shapefile');

// ======================
// COLEÇÃO MODIS
// ======================

var modis = ee.ImageCollection("MODIS/061/MOD11A2")
  .select(["LST_Day_1km", "QC_Day"])
  .filterDate("2025-01-01", "2025-12-31")
  .filterBounds(geometry);

// ======================
// FUNÇÃO DE MÁSCARA QC
// ======================

function maskLST(image) {

  var qc = image.select("QC_Day");

  // Bits 0-1:
  // 0 = boa qualidade
  // 1 = qualidade aceitável

  var mask = qc.bitwiseAnd(3).lte(1);

  return image.updateMask(mask);
}

// ======================
// CONVERTER PARA CELSIUS
// ======================

var lstCelsius = modis.map(function(img) {

  var masked = maskLST(img);

  return masked
    .select("LST_Day_1km")
    .multiply(0.02)
    .subtract(273.15)
    .rename("LST_Celsius")
    .copyProperties(img, ["system:time_start"]);
});

// ======================
// CONTAGEM DE PIXELS
// ======================

// Total de pixels possíveis na área
var totalPixels = ee.Image.constant(1)
  .clip(geometry)
  .reduceRegion({
    reducer: ee.Reducer.count(),
    geometry: geometry.geometry(),
    scale: 1000,
    maxPixels: 1e13
  })
  .get("constant");

// ======================
// CALCULAR % DE PIXELS VÁLIDOS
// ======================

var imagensComPercentual = lstCelsius.map(function(img) {

  // Conta pixels válidos
  var validPixels = img.reduceRegion({
    reducer: ee.Reducer.count(),
    geometry: geometry.geometry(),
    scale: 1000,
    maxPixels: 1e13
  }).get("LST_Celsius");

  // Percentual válido
  var percValidos = ee.Number(validPixels)
    .divide(ee.Number(totalPixels))
    .multiply(100);

  return img.set({
    "valid_pixels": validPixels,
    "perc_validos": percValidos
  });

});

// ======================
// FILTRAR >= 90% VÁLIDOS
// ======================

var imagensBoas = imagensComPercentual
.filter(ee.Filter.gte("perc_validos", 90));

// ======================
// MOSTRAR RESULTADOS
// ======================

print("Quantidade de imagens >=90% válidas:",
      imagensBoas.size());

var datas = imagensBoas.aggregate_array("system:time_start")
  .map(function(d) {
    return ee.Date(d).format("YYYY-MM-dd");
  });

print("Datas das imagens >=90% válidas:", datas);

// ======================
// MÉDIA APENAS DAS IMAGENS BOAS
// ======================

var lstMean = imagensBoas.mean().clip(geometry);

// ======================
// DESVIO PADRÃO
// ======================

var stdDev = imagensBoas
  .reduce(ee.Reducer.stdDev())
  .clip(geometry);

// ======================
// MÉDIA GERAL
// ======================

var meanValue = lstMean.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: geometry.geometry(),
  scale: 1000,
  maxPixels: 1e13
}).get("LST_Celsius");

// ======================
// Z-SCORE
// ======================

var zScore = lstMean
  .subtract(ee.Number(meanValue))
  .divide(stdDev);

// ======================
// ILHAS DE CALOR
// ======================

var heatIslands = zScore.gt(1);

// ======================
// VISUALIZAÇÃO
// ======================

Map.addLayer(
  lstMean,
  {
    min: 12,
    max: 38,
    palette: ["blue", "green", "yellow", "red"]
  },
  "Temperatura Média (>=90% válido)"
);

Map.addLayer(
  heatIslands.updateMask(heatIslands),
  {palette: ["red"]},
  "Ilhas de Calor"
);

// ======================
// EXPORTAR MÉDIA
// ======================

Export.image.toDrive({
  image: lstMean,
  description: "LST_Media_2025_90pct",
  folder: "GEE_Exports",
  fileNamePrefix: "lst_media_2025_90pct",
  region: geometry.geometry(),
  scale: 1000,
  crs: "EPSG:4326",
  maxPixels: 1e13
});

// ======================
// EXPORTAR ILHAS DE CALOR
// ======================

Export.image.toDrive({
  image: heatIslands,
  description: "Ilhas_Calor_2025_90pct",
  folder: "GEE_Exports",
  fileNamePrefix: "ilhas_calor_2025_90pct",
  region: geometry.geometry(),
  scale: 1000,
  crs: "EPSG:4326",
  maxPixels: 1e13
});

// ======================
// ESTATÍSTICAS POR POLÍGONO
// ======================

var stats = lstMean.reduceRegions({
  collection: geometry,
  reducer: ee.Reducer.mean(),
  scale: 1000
});

// ======================
// EXPORTAR CSV
// ======================

Export.table.toDrive({
  collection: stats,
  description: "Estatisticas_LST_90pct",
  folder: "GEE_Exports",
  fileNamePrefix: "estatisticas_lst_90pct",
  fileFormat: "CSV"
});
