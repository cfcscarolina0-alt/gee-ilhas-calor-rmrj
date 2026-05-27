// MODIS LST - 8 dias, 1km

//adicionar shp RMRJ
var geometry = ee.FeatureCollection("projects/estagio-464814/assets/rmrj")
//centraizar e apresentar
Map.centerObject(geometry, 10);
Map.addLayer(geometry, {color: 'black'}, 'Shapefile');
//carregou o rj, 
// MODIS LST - 8 dias, 1km 
var modis = ee.ImageCollection("MODIS/061/MOD11A2")
              .select("LST_Day_1km")
              .filterDate("2024-12-01", "2024-12-31")  // ajuste o período
              .filterBounds(geometry); // substitua "geometry" pela sua área de interesse
//tire barra para ver modis
//Map.addLayer(modis);

//para criar mascara para nuvens
// Função para aplicar máscara de nuvens/qualidade
function maskLST(image) {
  var qc = image.select('QC_Day');
  var mask = qc.eq(0);  // mantém apenas pixels de boa qualidade
  return image.updateMask(mask);
}

// Aplicar a máscara em toda a coleção
var modisMasked = modis.map(maskLST);

//conversão de dados kelvim para celcius
var lstCelsius = modis.map(function(img) {
  return img.multiply(0.02).subtract(273.15)
            .copyProperties(img, ["system:time_start"]);
});

// Média anual
var lstMean = lstCelsius.mean().clip(geometry);
var stdDev = lstCelsius.reduce(ee.Reducer.stdDev()).clip(geometry);
var mean = lstMean;

// Z = (X - média) / desvio-padrão
var zScore = lstMean.subtract(mean).divide(stdDev);
var heatIslands = zScore.gt(1);  // pixels com temperatura significativamente maior

// Visualização
Map.centerObject(geometry, 10);
Map.addLayer(lstMean, {min: 20, max: 40, palette: ["blue", "green", "yellow", "red"]}, "Temperatura Média (°C)");
Map.addLayer(heatIslands.updateMask(heatIslands), {palette: ["red"]}, "Ilhas de Calor (Z > 1)");

// exportar dados
Export.image.toDrive({
  image: lstMean,
  description: 'LST_Media_2024_12',
  folder: 'GEE_Exports',
  fileNamePrefix: 'lst_media_2024_12',
  region: geometry.geometry(), // ou geometry.bounds() se der erro
  scale: 1000,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
Export.image.toDrive({
  image: heatIslands,
  description: 'Ilhas_Calor_Zgt1_2024_12',
  folder: 'GEE_Exports',
  fileNamePrefix: 'ilhas_calor_zgt1_2024_12',
  region: geometry.geometry(),
  scale: 1000,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
var stats = lstMean.reduceRegions({
  collection: geometry,
  reducer: ee.Reducer.mean(),
  scale: 1000,
});

// Exporta como tabela (CSV)
Export.table.toDrive({
  collection: stats,
  description: 'Estatisticas_LST_por_poligono',
  folder: 'GEE_Exports',
  fileNamePrefix: 'estatisticas_lst',
  fileFormat: 'CSV'
});
