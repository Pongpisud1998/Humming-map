import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, platformBrowser } from '@angular/platform-browser';
import * as exifr from 'exifr';
import * as L from 'leaflet';
import 'leaflet.utm';
import * as turf from '@turf/turf';


interface LatLng {
  lat: number;
  lng: number;
}


@Injectable({
  providedIn: 'root'
})
export class ServiceService {

   
  httpOptions = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    })
  }

  x_sensor = 13.2; //width of sensor in mm
  y_sensor = 8.8; //height of sensor in mm

  image: any;
  raw_images: any = [];
  images: any = [];
  task_images: any = []

  altitude: any = 0;


  height: any = 50;

  gcp: any = {
    // id: 1,
    Label: "name_gcp",
    Easting: 0,
    Northing: 0,
    Elevation: 0,
    latitude: "",
    longitude: "",
    images: [],
    image_count: 0

  }

  arrayGCP: any = [];
  fileGcp: any = [];
  epsg_list: any = [{ "id": "1", "name": "WGS 84 - WGS84", "value": "4326", "proj4": "+proj=longlat +datum=WGS84 +no_defs +type=crs", "band": "-", "zone": "-" }, { "id": "2", "name": "WGS 84 \/ UTM zone 47N", "value": "32647", "proj4": "+proj=utm +zone=47 +datum=WGS84 +units=m +no_defs +type=crs", "band": "N", "zone": "47" }, { "id": "3", "name": "WGS 84 \/ UTM zone 48N", "value": "32648", "proj4": "+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs +type=crs", "band": "N", "zone": "48" }, { "id": "4", "name": "Indian 1975 \/ UTM zone 47N", "value": "24047", "proj4": "+proj=utm +zone=47 +ellps=evrst30 +towgs84=293,836,318,0.5,1.6,-2.8,2.1 +units=m +no_defs +type=crs", "band": "N", "zone": "47" }, { "id": "5", "name": "Indian 1975 \/ UTM zone 48N", "value": "24048", "proj4": "+proj=utm +zone=48 +ellps=evrst30 +towgs84=293,836,318,0.5,1.6,-2.8,2.1 +units=m +no_defs +type=crs", "band": "N", "zone": "48" }];
  zone: any;
  band: any;
  epsg: any;
  proj4: any;


  constructor(
    private http: HttpClient,
    public domSanitizer: DomSanitizer,
  ) {
  }

  async saveImageRaw(f: File, imageUrl: string) {
    if (f.type === 'image/jpeg' || f.type === 'image/png' || f.type === 'image/tiff') {
      await exifr.parse(f, true)
        .then(async output => {

          var resizeimage: any = imageUrl

          if (f.type == 'image/tiff') {
            output.ExifImageWidth = output.ImageWidth;
            output.ExifImageHeight = output.ImageHeight;
          } else {
            await this.resizeImage(imageUrl, output.ExifImageWidth / 8, output.ExifImageHeight / 8).then((res: any) => {
              resizeimage = res
            })
          }

          if (output.latitude != undefined && output.longitude != undefined) {
            var dsm: any = 0;
            var tgm: any = 0;
            let image: any;
            var h: any;

            if (output.RelativeAltitude != undefined) {
              if (this.altitude == 0) {
                h = Number(output.RelativeAltitude);
              } else {
                h = this.altitude;
              }
            }
            if (output.GimbalPitchDegree != undefined && output.GimbalReverse != undefined && output.GimbalRollDegree != undefined && output.GimbalYawDegree != undefined) {
              var pixel: any = output.ExifImageWidth;
              var gsd: any = (((h * this.x_sensor) * 100) / (this.y_sensor * pixel)).toFixed(3); // m * 100 -> cm
              var footprint: any = { width: Math.ceil(output.ExifImageWidth * gsd) / 100, height: Math.ceil(output.ExifImageHeight * gsd) / 100 };

              var gimbal: any = { picth: output.GimbalPitchDegree, reverse: output.GimbalReverse, roll: output.GimbalRollDegree, yaw: output.GimbalYawDegree }
              var utm: any = await L.latLng(output.latitude, output.longitude).utm();
              var coord1: any = await (L.utm({ x: Number(utm.x + (footprint.width / 2)), y: Number(utm.y + (footprint.height / 2)), zone: utm.zone, band: utm.band, southHemi: false })).latLng();
              var coord3: any = await (L.utm({ x: Number(utm.x - (footprint.width / 2)), y: Number(utm.y - (footprint.height / 2)), zone: utm.zone, band: utm.band, southHemi: false })).latLng();
              var poly: any = await turf.bboxPolygon([coord3.lng, coord3.lat, coord1.lng, coord1.lat]);
              if (gimbal.yaw < 0) {
                gimbal.yaw = (360 - Math.abs(gimbal.yaw));
              }
              var rotatedPoly: any = await turf.transformRotate(poly, gimbal.yaw);
              image = { img: this.domSanitizer.bypassSecurityTrustResourceUrl(imageUrl), name: f.name, lat: output.latitude, lng: output.longitude, check: false, distance: 0, gcp_label: "", x: "", y: "", geom: rotatedPoly, url: resizeimage, yaw: output.GimbalYawDegree }
            } else {
              image = { img: this.domSanitizer.bypassSecurityTrustResourceUrl(imageUrl), name: f.name, lat: output.latitude, lng: output.longitude, check: false, distance: 0, gcp_label: "", x: "", y: "", geom: null, url: resizeimage, yaw: null }
            }
            return this.saveImage(image, f);
          }

        })
    }
  }

  saveImage(image: any, file: any) {
    const match = this.images.filter((item: any) => item.name === image.name);
    if (match.length === 0) {
      this.images.push(image);
      this.task_images.push(file)
    } else {
      match[0].url = image.url;
    }

    return image;
  }

  clearImage() {
    if (this.images.length > 0) {
      this.images = [];
    }
  }

  async matchImage() {
    setTimeout(() => {
      this.arrayGCP.forEach(async (e: any, i: any) => {
        let f = await this.images.find((x: any) => x.name === e.Filename)
        if (f != undefined) {
          f.check = true;
          f.x = e.x;
          f.y = e.y;
          e.check = true;
          let epsg = this.epsg_list.filter((find: any) => find.value == this.epsg);

          this.zone = epsg[0].zone;
          this.band = epsg[0].band;
          var gcp = L.utm({ x: e.Easting, y: e.Northing, zone: this.zone, band: this.band, southHemi: false });
          var coord: any = gcp.latLng();
          e.latitude = coord.lat;
          e.longitude = coord.lng;
          let find_gcp = this.fileGcp.find((y: any) => y.Label == e.Label);
          if (find_gcp == undefined) {
            this.fileGcp.push({
              Label: e.Label,
              Easting: e.Easting,
              Northing: e.Northing,
              Elevation: e.Elevation,
              latitude: e.latitude,
              longitude: e.longitude,
              images: [{ image: e.Filename, x: e.x, y: e.y }],
            });
          } else {
            find_gcp.images.push({ image: e.Filename, x: e.x, y: e.y });
          }
        }
      });
    }, 1000)

  }

  removeImage(image: any) {
    let f = this.images.find((e: any) => e.name == image.name);
    if (f != undefined) {
      this.images.splice(this.images.indexOf(f), 1)
      this.task_images.splice(this.images.indexOf(f), 1)
    }
  }

  resizeImage(url: string, desiredWidth: number, desiredHeight: number): Promise<string> {
    return new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx: any = canvas.getContext('2d');

        // Set the canvas dimensions to the desired size
        canvas.width = desiredWidth;
        canvas.height = desiredHeight;

        // Draw the image onto the canvas at the desired size
        ctx.drawImage(img, 0, 0, desiredWidth, desiredHeight);

        // Convert the canvas image to a data URL and resolve the promise
        const resizedImageUrl = canvas.toDataURL();
        resolve(resizedImageUrl);
      };

      // Load the image
      img.src = url;
    });
  }
}
