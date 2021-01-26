// Point in Niger
var poi = ee.Geometry.Point(7,13)
var polygon = ee.Geometry.Polygon([[[-0.88, 11.5], [-0.88, 16.2], [14.6, 16.2], [14.6, 11.5]]])

Map.setOptions('HYBRID')

var bounds = polygon
// var bounds = aoi_small

//// FAO GAUL      
var adminArea_niger = ee.FeatureCollection("FAO/GAUL/2015/level0").filterBounds(poi)
var adminArea_states = ee.FeatureCollection("FAO/GAUL/2015/level2").filterBounds(adminArea_niger).filterBounds(bounds) 

//// humdata
var adminArea_states_hum = ee.FeatureCollection("users/estherbarvels/DPPD/niger/NER_adm02_feb2018")
adminArea_states_hum = adminArea_states_hum.filterBounds(bounds).select(['NOMDEP','adm_01','adm_02'])
var aoi = adminArea_states_hum.geometry().bounds()

//// Village  polygons
var villages_fc = ee.FeatureCollection("users/estherbarvels/DPPD/niger/Grouping_Villages")


//// Crop mask Kadidia
var crop_mask_kad = ee.Image('users/estherbarvels/DPPD/niger/crop_mask_epsg4326')

//// Proba-V 100m
var lc_probav2019 = ee.Image('COPERNICUS/Landcover/100m/Proba-V-C3/Global/2019').select('discrete_classification').clip(bounds)

// orange: Shrub, (20)
// yellow: Herbaceous vegetation, (30)
// pink: Cultivated and managed vegetation / agriculture (40)
// red: Settlements (50)
// grey: bare/sparse vegetation (60)
// blue:  open water (80)
// turqoise: Herbaceous wetland (90)
// green/brown: Closed forest (111-126)

// //stack all LC classes into one image
// var landCover = lc_probav2019.eq(20).rename('class_20')
//               .addBands(lc_probav2019.eq(30).rename('class_30'))
//               .addBands(lc_probav2019.eq(40).rename('class_40'))
//               .addBands(lc_probav2019.eq(50).rename('class_50'))
//               .addBands(lc_probav2019.eq(60).rename('class_60'))
//               .addBands(lc_probav2019.eq(80).rename('class_80'))
//               .addBands(lc_probav2019.eq(90).rename('class_90'))
//               .addBands(lc_probav2019.gte(111).and(lc_probav2019.lte(126)).rename('class_111'))
//               .addBands(lc_probav2019.gte(0).rename('total'))

// //calculate area per pixel in km² and reduce to feature collection
// var landCover_area = landCover.multiply(ee.Image.pixelArea()).divide(1000000)
// var fc = landCover_area.reduceRegions({
//   collection: villages_fc,
//   reducer: ee.Reducer.sum(),
//   scale: 100
// });
// print('LC classes area', fc.first())

// //compute proportional LC area per feature
// function compute_prop(feature) {
//   var class20 = ee.Number(feature.get('class_20')).divide(ee.Number(feature.get('total')))
//   var class30 = ee.Number(feature.get('class_30')).divide(ee.Number(feature.get('total')))
//   var class40 = ee.Number(feature.get('class_40')).divide(ee.Number(feature.get('total')))
//   var class50 = ee.Number(feature.get('class_50')).divide(ee.Number(feature.get('total')))
//   var class60 = ee.Number(feature.get('class_60')).divide(ee.Number(feature.get('total')))
//   var class80 = ee.Number(feature.get('class_80')).divide(ee.Number(feature.get('total')))
//   var class90 = ee.Number(feature.get('class_90')).divide(ee.Number(feature.get('total')))
//   var class111 = ee.Number(feature.get('class_111')).divide(ee.Number(feature.get('total')))
//   var total = ee.Number(feature.get('total')).divide(ee.Number(feature.get('total')))
  
//   return feature.set('class_20', class20)
//                 .set('class_30', class30)
//                 .set('class_40', class40)
//                 .set('class_50', class50)
//                 .set('class_60', class60)
//                 .set('class_80', class80)
//                 .set('class_90', class90)
//                 .set('class_111', class111)
//                 .set('total', total)
// }

// fc = fc.map(compute_prop)
// print('LC classes area proportion', fc.first())

// Export.table.toDrive({
//   collection: fc,
//   description:'vill_landcover_prop',
//   fileFormat: 'CSV'
// });

var mask_combined = crop_mask_kad.updateMask(lc_probav2019.eq(40)).unmask()
var mask_probav = lc_probav2019.eq(40)
Map.addLayer(mask_combined,{min:0,max:1}, 'Combined crop mask', false)
Map.addLayer(lc_probav2019,{}, 'LC Proba-V 100m 2019',false)
Map.addLayer(mask_probav,{min:0,max:1}, 'Proba-V Cropland/managed vegetation (40)',false) // The class we are interested in
Map.addLayer(crop_mask_kad, {min:0, max:1}, 'Crop mask Kadidia',false)

// //choose a crop mask layer
// var crop_mask = mask_combined
var crop_mask = mask_probav


Map.centerObject(bounds,9)

var from_ = '2016-01-01'
var until_ = '2020-12-31'
var date_range_monthly = make_date_range_monthly(ee.Date(from_),ee.Date(until_))


var rainy_season_start = 6
var rainy_season_end = 9
// Sentinel-2
var sentinel2 = ee.ImageCollection('COPERNICUS/S2')
      .filterBounds(bounds)
      .filterDate(from_, until_)
      .map(clipFunc)
      .map(maskS2clouds) // add better cloud/shadow mask
      .select(['B2','B3','B4', 'B8'], ['blue','green','red','nir']) 
      .map(function(img){return addIndices(img).updateMask(crop_mask)
      }) 
      .sort('system:time_start');

print('First date in S2 collection', sentinel2.first().date())
var savi = sentinel2.select('savi')

print('savi imgcol', savi.size())

// MODIS Evapotranspiration
var evapo = ee.ImageCollection('MODIS/006/MOD16A2')
                  .filter(ee.Filter.date(from_, until_))
                  .filter(ee.Filter.calendarRange(rainy_season_start,rainy_season_end,'month'))
                  .select('ET')
                  .map(clipFunc)
                  
// print('evap imgCol', evapo )                  
var evapotranspirationVis = {
  min: 0.0,
  max: 200.0,
  palette: [
    'ffffff', 'fcd163', '99b718', '66a000', '3e8601', '207401', '056201', '004c00', '011301'
  ],
};
// Map.addLayer(evapo.first(), evapotranspirationVis, 'Evapo first img', false)

// CHIRPS Precipiation  
var chirps_daily = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
                  .filter(ee.Filter.date(from_, until_)).filter(ee.Filter.calendarRange(rainy_season_start,rainy_season_end,'month'))
                  .map(clipFunc)
var chirps_pentad = ee.ImageCollection('UCSB-CHG/CHIRPS/PENTAD')
                  .filter(ee.Filter.date(from_, until_)).filter(ee.Filter.calendarRange(rainy_season_start,rainy_season_end,'month'))
                  .map(clipFunc)
                  
// Visualise daily/5-day rainfall (easier to look at pentad (5-days) data)
print(ui.Chart.image.seriesByRegion({
  imageCollection: chirps_daily,
  regions: bounds,
  reducer: ee.Reducer.mean(),
  band: 'precipitation',
  scale: 2500,
  xProperty: 'system:time_start',
}).setOptions({title: 'Daily precipitation (spatial mean) ', 
vAxis: {title: 'Precipitation (mm)'}
}).setChartType('ColumnChart'));
  

// Compute monthly metrics
// var savi_monthly = aggregate_monthly(savi, date_range_monthly)
var evapo_monthly = aggregate_monthly(evapo, date_range_monthly)
                      .filter(ee.Filter.calendarRange(rainy_season_start,rainy_season_end,'month'))
var precip_monthly = aggregate_monthly(chirps_daily, date_range_monthly)
                      .filter(ee.Filter.calendarRange(rainy_season_start,rainy_season_end,'month'))


print('evapo_monthly imgCol',evapo_monthly)



var start_year = 2016
var end_year = 2020

function make_yearList (start, end){
  var yearList = []
  for (var i = start; i < end+1; i++) { yearList.push(i) }
  return yearList
}
  
var yearList = make_yearList(start_year, end_year)


// Compute annual/seasonal metrics
var savi_annually = aggregate_annually(savi, yearList)
var precip_annually = aggregate_annually(chirps_daily, yearList)
var evapo_annually = aggregate_annually(evapo, yearList)

// make new band names because reducing to image later on through toBands() will automatically result in ugly bandnames
var savi_bandNames = make_new_bandNames('savimax_', start_year, end_year)
var precip_bandNames = make_new_bandNames_two('pr_mean_', 'pr_sum_', start_year, end_year)
var evapo_bandNames = make_new_bandNames_two('ev_mean_', 'ev_sum_', start_year, end_year)

var evapo_bandNames_monthly = evapo_monthly.toList(evapo_monthly.size()).map(function(img){
  return ee.String('ET_sum_').cat(ee.Image(img).get('date')) // use property 'date' to label the bands later on
})
var precip_bandNames_monthly = evapo_monthly.toList(evapo_monthly.size()).map(function(img){
  return ee.String('pr_sum_').cat(ee.Image(img).get('date'))
})


// Convert image collection to images
var savi_img = savi_annually.select('savi_max').toBands().rename(savi_bandNames)
var precip_img = precip_annually.select(['precipitation_mean', 'precipitation_sum']).toBands().rename(precip_bandNames)
var evapo_img = evapo_annually.select(['ET_mean', 'ET_sum']).toBands().rename(evapo_bandNames)

var precip_monthly_img = precip_monthly.toBands().rename(precip_bandNames_monthly)
var evapo_monthly_img = evapo_monthly.toBands().rename(evapo_bandNames_monthly)

print('savi image', savi_img)
print('evapo_monthly img', evapo_monthly_img)


// combine all images into one image 
var variables_img = savi_img.addBands(evapo_img).addBands(precip_img)
                      .addBands(precip_monthly_img).addBands(evapo_monthly_img)

print('img with all variables', variables_img)

// reduce to feature collection
var mean_per_feature = reduce_to_fc(variables_img, ee.Reducer.mean())

Export.table.toDrive({
  collection: mean_per_feature,
  description:'vill_predictor_var_mean',
  fileFormat: 'CSV',
  folder: 'DPPD_niger'
});

// print('Property names of fc', mean_per_feature.first().propertyNames())

 

Map.addLayer(savi_img,{bands:['savimax_2020'],min:0,max:1.7, palette:['white','green']},'SAVI Max. 2020', false)
Map.addLayer(savi_img,{bands:['savimax_2016'],min:0,max:1.7, palette:['white','green']},'SAVI Max. 2016', false)

// // Map.addLayer(lc_globecover2009,'','LC ESA 2009 300m',false)
// Map.addLayer(lc_esa2016,{min:1 ,max:10, palette:palette_esa2016},'LC ESA 2016 20m', false)
// Map.addLayer(lc_modis2019, vis_lc_modis, 'LC Modis 2019 500m',false)
Map.addLayer(crop_mask,{min:0,max:1}, 'Crop mask', false)
Map.addLayer(lc_probav2019,{}, 'LC Proba-V 100m 2019',false)
Map.addLayer(mask_probav,{min:0,max:1}, 'Proba-V Cropland/managed vegetation (40)',false)


Map.addLayer(ee.Image("CGIAR/SRTM90_V4").clip(polygon),{min:100, max: 500}, 'Elevation',false)
Map.addLayer(villages_fc,{}, 'Villages',false)
// Map.addLayer(adminArea_states, '', 'States',false)
// Map.addLayer(adminArea_states_hum,{color:'blue'}, 'States humdata',false)
// Map.addLayer(polygon, '', 'polygon',false)
// Map.addLayer(adminArea_niger, '', 'Niger',false)




function reduce_to_fc(img, reducer){
  var fc = img.reduceRegions({
  'collection': villages_fc,//.filterBounds(bounds),
  'reducer': reducer,
  // 'tileScale': 4,
  'scale': 200
  })
  return fc
}
function make_new_bandNames(name_str, start, end){
  var newBands = []
  for (var i = start; i < end+1; i++) {
  newBands.push(name_str.concat(i.toString()))
  }
  return newBands
}

function make_new_bandNames_two(name_str, name_str2, start, end){
  var newBands = []
  for (var i = start; i < end+1; i++) {
  newBands.push(name_str.concat(i.toString()))
  newBands.push(name_str2.concat(i.toString()))
  }
  return newBands
  
} 

function reduce_imgCol(imgCol){
  var mean = imgCol.reduce(ee.Reducer.mean())
  // var median = imgCol.reduce(ee.Reducer.median())
  var sum = imgCol.reduce(ee.Reducer.sum())
  var sd = imgCol.reduce(ee.Reducer.stdDev())
  
  return mean.addBands(sum).addBands(sd)//.addBands(median)
}

function aggregate_monthly(imgCol, date_range){
  return ee.ImageCollection.fromImages(
      date_range.map(function (date) {
        date = ee.Date(date)
        imgCol = imgCol.filterDate(date, date.advance(1,'month'))
        // return reduce_imgCol(imgCol)
        return imgCol.reduce(ee.Reducer.sum()) // we only need monthly sum
                .set('date', date.format('YYYY-MM')).set('system:time_start', date.millis())}))
}

function aggregate_annually(imgCol, year_range){
  return ee.ImageCollection.fromImages(
      year_range.map(function (y) {
        var imgCol_filtered = imgCol.filter(ee.Filter.calendarRange(y, y, 'year'))
                                  .filter(ee.Filter.calendarRange(rainy_season_start,rainy_season_end, 'month'))
        var max = imgCol_filtered.reduce(ee.Reducer.max())
        return reduce_imgCol(imgCol_filtered).addBands(max)
                .set('year', y).set('system:time_start',ee.Date(y.toString()).millis())
      }))
}


function make_date_range_monthly(start,end){
  var n_months = end.difference(start,'month').round().subtract(1);
  var range = ee.List.sequence(0,n_months,1); 
  var make_datelist = function (n) {
    return start.advance(n,'month')
  };
  return range.map(make_datelist);
}

function maskS2clouds(image) {
  var qa = image.select('QA60');

  // Bits 10 and 11 are clouds and cirrus, respectively.
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;

  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));

  return image.updateMask(mask);//.divide(1000)
}

function clipFunc(img){
  return img.clip(bounds)
} 
function apply_crop_mask(img){
      return img.updateMask(crop_mask)
}

function addIndices (img){
    var ndvi = img.expression('float(b("nir") - b("red")) / (b("nir") + b("red"))').rename('ndvi')
    var savi = img.expression('(float(b("nir") - b("red")) / (b("nir") + b("red") + 0.9) * 1.9)').rename('savi')
    return img.addBands([ndvi,savi]);
}



// //click on point to get time series
// var i=0;
// var print_point = function(coords, map) {
//   i++;
//   var coord_array = Object.keys(coords).map(function (key) { return coords[key]; });
//   var point = ee.Geometry.Point(coord_array);
//   print('point ' + i, point);
//   Map.addLayer(point, {color: 'red'});
//   // put i somewhere near that point on the map
//   // Plot the time series data at the ROI..
  
//   var chart = ui.Chart.image.series(sentinel2.select(['ndvi', 'savi']), point, ee.Reducer.mean(), 30)
//     .setOptions({
//       title: 'Sentinel-2 NDVI',
//       lineWidth: 1,
//       pointSize: 3,
//     })
//   print(chart)

//   var chart = ui.Chart.image.series(chirps_daily.select(['precipitation']), point, ee.Reducer.mean(), 30)
//     .setOptions({
//       title: 'Precipitation daily sum (mm)',
//       lineWidth: 1,
//       pointSize: 3,
//     }).setChartType('ColumnChart');
//   print(chart)

  
// };


// Map.onClick(print_point);


