var rgbpov = {};

// Wrapper for image data with helper functions
rgbpov.image = {
  initialize: function(image) {
    // Remember image/canvas size
    rgbpov.image.size = {x: image.width, y: image.height};
    
    // Initialize invisible canvas
    rgbpov.image.canvas = rgbpov.image.canvas || $('<canvas />')[0];
    rgbpov.image.canvas.width = image.width;
    rgbpov.image.canvas.height = image.height;
    rgbpov.image.canvas.getContext('2d').drawImage(image, 0, 0);
    rgbpov.image._data = rgbpov.image.canvas.getContext('2d').getImageData(0, 0, image.width, image.height).data;
  },
  pixel: function(x,y) {
    var idx = (x + rgbpov.image.size.x * y) * 4;
    return [rgbpov.image._data[idx],
            rgbpov.image._data[idx+1],
            rgbpov.image._data[idx+2],
            rgbpov.image._data[idx+3]];
  }
};

// Sub-pixel interpolation
rgbpov.interp = {

  // Weighted by distance from center of pixel
  weighted: function(image, position) {
    // Coordinates of closest pixels
    var pixel_coords = [{x: Math.floor(position.x), y: Math.floor(position.y)},
                        {x: Math.ceil(position.x),  y: Math.floor(position.y)},
                        {x: Math.floor(position.x), y: Math.ceil(position.y)},
                        {x: Math.ceil(position.x),  y: Math.ceil(position.y)}];
    
    // Distance from position to the center of each pixel
    var rs = [];
    
    // Pixel data for each closest pixel
    var pixels = [];
    
    // Weights of each surrounding pixel
    var weights = [];
   
    // Resultant pixel
    var result = [];
    
    // Pre-compute information about the pixel
    for(var p = 0; p < 4; p += 1) {
      rs[p] = Math.sqrt(Math.pow(position.x-pixel_coords[p].x, 2) + Math.pow(position.y-pixel_coords[p].y, 2));
      pixels[p] = image.pixel(pixel_coords[p].x, pixel_coords[p].y);
      weights[p] = 1 - rs[p] / Math.sqrt(2); // normalize to sqrt(2)... smaller rs[p], the greater p's weight
    }
    
    // Compute the final pixel value foreach colour, c (R,G,B,A)
    for(var c = 0; c < 4; c += 1) {
        result[c] = weights[0] * pixels[0][c];   // contribution of pixel 0
        result[c] += weights[1] * pixels[1][c];  // contribution of pixel 1
        result[c] += weights[2] * pixels[2][c];  // contribution of pixel 2
        result[c] += weights[3] * pixels[3][c];  // contribution of pixel 3
        result[c] /= weights[0] + weights[1] + weights[2] + weights[3]; // normalize the contributions
        result[c] = Math.round(result[c]); // round to nearest color
    }
    
    return result;
  },
  
  // Nearest neighbour
  nearest: function(image, position) {
    // Coordinates of closest pixels
    var pixel_coords = [{x: Math.floor(position.x), y: Math.floor(position.y)},
                        {x: Math.ceil(position.x),  y: Math.floor(position.y)},
                        {x: Math.floor(position.x), y: Math.ceil(position.y)},
                        {x: Math.ceil(position.x),  y: Math.ceil(position.y)}];
    
    // Distance from position to the center of each pixel
    var rs = [];
    
    // Pixel data foreach closest pixel
    var pixels = [];
    
    // Pre-compute information about the pixel
    for(var p = 0; p < 4; p += 1) {
      rs[p] = Math.sqrt(Math.pow(position.x-pixel_coords[p].x, 2) + Math.pow(position.y-pixel_coords[p].y, 2));
      pixels[p] = image.pixel(pixel_coords[p].x, pixel_coords[p].y);
    }
    
    // Find nearest neighbour
    var nearest = 0;
    for(var p = 0; p < 4; p += 1) {
      if (rs[p] < rs[nearest]) {
        nearest = p;
      }
    }
      
    return pixels[nearest];
  }
};
    
rgbpov.make_rgba = function(options, interp) {
  // Initialize empty args if not specified
  options = options || {};
  
  // Use nearest neighbour interpolation if not specified
  interp = interp || rgbpov.interp.nearest;
  
  // Resulting POV image
  var result = { r: [], g: [], b: [], a: [] };
  
  // Number of circle divisions
  var circle_divisions = options.circle_divisions || 256.; // default: 256 divisions
  
  // Number of LEDs along radial direction
  var led_count = options.led_count || 16.; // default: 16 LEDs
  
  // Rotation offset (rads)
  var a_offset = options.a_offset || 0.; // default: 0 rads
  
  // Origin of rotation (px)
  var origin = options.origin || {x: rgbpov.image.size.x/2., y: rgbpov.image.size.y/2.}; // default: image center

  // Arm radius (px)
  var R = options.R || (rgbpov.image.size.x < rgbpov.image.size.y ? rgbpov.image.size.x/2. : rgbpov.image.size.y/2.); // default: shortest distance from center to edge

  // Sample image forradial points
  for(var a = 0; a < circle_divisions; a += 1) {
    result.r[a] = [];
    result.g[a] = [];
    result.b[a] = [];
    result.a[a] = [];
    
    for(var r = 0; r < led_count; r += 1) {
      // LED position along rotated arm
      var position = {x: origin.x + R*((r+1)/(led_count+2))*Math.cos(2*Math.PI*(a/circle_divisions)+a_offset),
                      y: origin.y + R*((r+1)/(led_count+2))*Math.sin(2*Math.PI*(a/circle_divisions)+a_offset)};

      // Sample image and interpolate pixel value
      rgba_pixel = interp(rgbpov.image, position);
      
      result.r[a][r] = rgba_pixel[0];
      result.g[a][r] = rgba_pixel[1];
      result.b[a][r] = rgba_pixel[2];
      result.a[a][r] = rgba_pixel[3];
    }
  }
  
  result.size = [circle_divisions, led_count];
  
  return result;
};
  
rgbpov.render = {
  // TODO might benefit from templating
  
  // Output rgba in format for use with RGB Spoke POV (AVR-C)
  C: function(rgba, target) {
    var s = "";
    $(target).empty(); // clear target
    
    // Red
    s += 'uint8_t red['+rgba.size[0]+']['+rgba.size[1]+'] PROGMEM = {\n';
    for(var i = 0; i < rgba.size[0]; i += 1) {
      s += ' {';
      for(var j = 0; j < rgba.size[1]; j += 1) {
        s += rgba.r[i][j];
        if (j < rgba.size[1]-1) {
          s += ',';
        }
      }
      s += '},\n';
    }
    s += '};\n\n';
    
    // Green
    s += 'uint8_t green['+rgba.size[0]+']['+rgba.size[1]+'] PROGMEM = {\n';
    for(var i = 0; i < rgba.size[0]; i += 1) {
      s += ' {';
      for(var j = 0; j < rgba.size[1]; j += 1) {
        s += rgba.g[i][j];
        if (j < rgba.size[1]-1) {
          s += ',';
        }
      }
      s += '},\n';
    }
    s += '};\n\n';
    
    // Blue
    s += 'uint8_t blue['+rgba.size[0]+']['+rgba.size[1]+'] PROGMEM = {\n';
    for(var i = 0; i < rgba.size[0]; i += 1) {
      s += ' {';
      for(var j = 0; j < rgba.size[1]; j += 1) {
        s += rgba.b[i][j];
        if (j < rgba.size[1]-1) {
          s += ',';
        }
      }
      s += '},\n';
    }
    s += '};\n\n// Generated with rgbpov.js';
    
    $(target).html(s);
    delete s;
  },
  
  // Output rgba as an "image" (actualy, coloured divs.. sorry)
  HTML: function(rgba, target) {
    $(target).empty(); // clear target
    
    for(var i = 0; i < rgba.size[0]; i += 1) {
      $(target).append('<div class="line"></div>'); // new line
      var line = $('.line', target).last();
      for(var j = 0; j < rgba.size[1]; j += 1) {
        line.append('<div class="pixel" style="background-color: rgb('+rgba.r[i][j]+','+rgba.g[i][j]+','+rgba.b[i][j]+')"></div>');
      }
    }
  }
  
}