/*
 * Flush stats to Bosun (http://bosun.org/)
 *
 * To enable this backend, include 'bosun' in the backends
 * configuration array:
 *
 *   backends: ["./backends/bosun"]
 *
 * The backend will read the configuration options from the following
 * 'bosun' hash defined in the main statsd config file:
 *
 * bosun: {
 *   host: '127.0.0.1',   // Bosun host. (default 127.0.0.1)
 *   port: 8087,          // Bosun port. (default 8087)
 *   ssl: false,          // Bosun is hosted over SSL. (default false)
 *   tagPrefix: '_t_'     // Tag prefix for metrics that include tags
 * }
 *
 */

var util = require('util'),
    querystring = require('querystring'),
    http = require('http'),
    https = require('https');

function BosunBackend(startupTime, config, events) {
  var self = this;

  self.debug = config.debug;
  self.bosunStats = {};

  self.defaultHost = '127.0.0.1';
  self.defaultPort = 8087;

  self.host = self.defaultHost;
  self.port = self.defaultPort;
  self.protocol = http;

  self.prefixStats = config.prefixStats !== undefined ? config.prefixStats : 'statsd';

  if (config.bosun) {
    self.host = config.bosun.host || self.defaultHost;
    self.port = config.bosun.port || self.defaultPort;
    self.tagPrefix = config.bosun.tagPrefix;

    if (config.bosun.ssl) {
      self.protocol = https;
    }
  }
  
  events.on('flush', function (timestamp, metrics) {
    try {
      self.processFlush(timestamp, metrics);
    } catch (e) {
      self.log(e);
    }
  });

  events.on('status', function (writeCb) {
    for (var stat in self.bosunStats) {
      writeCb(null, 'bosun', stat, self.bosunStats[stat]);
    }
  });

  return true;
}

function millisecondsSince(start) {
  diff = process.hrtime(start);
  return diff[0] * 1000 + diff[1] / 1000000;
}

BosunBackend.prototype.log = function (msg) {
  util.log('[bosun] ' + msg);
}

BosunBackend.prototype.logDebug = function (msg) {
  if (this.debug) {
    var string;

    if (msg instanceof Function) {
      string = msg();
    } else {
      string = msg;
    }

    util.log('[bosun] (DEBUG) ' + string);
  }
}

/**
 * Flush strategy handler
 *
 * @param {Number} timestamp
 * @param {Object} stats metric
 */
BosunBackend.prototype.processFlush = function (timestamp, metrics) {
  var self = this,
      counters = metrics.counters,
      gauges = metrics.gauges,
      timerData = metrics.timer_data,
      statsdMetrics = metrics.statsd_metrics,
      points = [],
      sets  = function (vals) {
        var ret = {};
        for (var val in vals) {
          ret[val] = vals[val].values();
        }
        return ret;
      }(metrics.sets),
      startTime = process.hrtime(),
      key, timerKey,
      statsPrefixRegexp = new RegExp('^' + self.prefixStats + '\\.');

  for (key in counters) {
    if (key.match(statsPrefixRegexp)) { continue; }

    var tags = self.parse_tags(key);
    var stripped_key = self.strip_tags(key);

    var value = counters[key],
        k = stripped_key + '.counter';

    if (value) {
      points.push(self.assembleEvent(k, [{value: value, time: timestamp, tags: tags}]));
    }
  }

  for (set in sets) {
    var tags = self.parse_tags(set);
    var stripped_set = self.strip_tags(set);

    sets[set].map(function (v) {
      points.push(self.assembleEvent(stripped_set, [{value: v, time: timestamp, tags: tags}]));
    })
    points.push(self.assembleEvent(stripped_set + "_count", [{value: sets[set].length, time: timestamp, tags: tags}]));
  }

  for (key in gauges) {
    if (key.match(statsPrefixRegexp)) { continue; }

    var tags = self.parse_tags(key);
    var stripped_key = self.strip_tags(key);

    var value = gauges[key],
        k = stripped_key + '.gauge';

    if (!isNaN(parseFloat(value)) && isFinite(value)) {
      points.push(self.assembleEvent(k, [{value: value, time: timestamp, tags: tags}]));
    }
  }

  for (key in timerData) {
    var tags = self.parse_tags(key);
    var stripped_key = self.strip_tags(key);

    var timerMetrics = timerData[key];

    if (timerMetrics.histogram) {
      var histoMetrics = timerMetrics.histogram
        , histoKey;

      for (histoKey in histoMetrics) {
        var value = histoMetrics[histoKey],
          k = stripped_key + '.timer.histogram.' + histoKey;

        points.push(self.assembleEvent(k, [{value: value, time: timestamp, tags: tags}]));
      }

      delete timerMetrics.histogram;
    }

    for (timerKey in timerMetrics) {
      var tags = self.parse_tags(key);
      var stripped_key = self.strip_tags(key);

      var value = timerMetrics[timerKey],
          k = stripped_key + '.timer' + '.' + timerKey;

      points.push(self.assembleEvent(k, [{value: value, time: timestamp, tags: tags}]));
    }
  }

  self.httpPOST(points);
  self.bosunStats.flushTime = millisecondsSince(startTime);
}

BosunBackend.prototype.assembleEvent = function (name, events) {
  var self = this;

  var payload = {
    metric: name,
    value: events[0]['value'],
    timestamp: events[0]['time'],
    tags: events[0]['tags']
  }

  return payload;
}

BosunBackend.prototype.httpPOST = function (points) {
  if (!points.length) { return; }

  var self = this,
      protocolName = self.protocol == http ? 'HTTP' : 'HTTPS',
      startTime;

  self.logDebug(function () {
    return 'Sending ' + points.length + ' different points via ' + protocolName;
  });

  self.bosunStats.numStats = points.length;

  var options = {
    hostname: self.host,
    port: self.port,
    path: '/api/put',
    method: 'POST',
    agent: false
  };

  var req = self.protocol.request(options);

  req.on('socket', function (res) {
    startTime = process.hrtime();
  });

  req.on('response', function (res) {
    var status = res.statusCode;

    self.bosunStats.httpResponseTime = millisecondsSince(startTime);

    if (status >= 400) {
      self.log(protocolName + ' Error: ' + status);
    }
  });

  req.on('error', function (e, i) {
    self.log(e);
  });

  var payload = JSON.stringify(points);

  self.bosunStats.payloadSize = Buffer.byteLength(payload);

  self.logDebug(function () {
    var size = (self.bosunStats.payloadSize / 1024).toFixed(2);
    return 'Payload size ' + size + ' KB';
  });

  req.write(payload);
  req.end();
}

BosunBackend.prototype.parse_tags = function (metric_name) {
  var self = this;

  var parts = metric_name.split(".");
  var tags = {};
  var current_tag_name = "";
  for (i in parts) {
    var p = parts[i]
    if (p.indexOf(self.tagPrefix) == 0) {
      var tag_name = p.split(self.tagPrefix)[1];
      current_tag_name = tag_name
    } else if (current_tag_name != "") {
      tags[current_tag_name] = p;
      current_tag_name = "";
    }
  }

  return tags;
}

BosunBackend.prototype.strip_tags = function (metric_name) {
  var self = this;

  var parts = metric_name.split(".");
  var rslt_parts = [];
  while (parts.length > 0) {
    if (parts[0].indexOf(self.tagPrefix) == 0) {
      parts.shift();
      parts.shift();
      continue;
    }
    rslt_parts.push(parts.shift());
  }

  return rslt_parts.join(".");
}

BosunBackend.prototype.configCheck = function () {
  var self = this,
      success = true;

  return success;
}

exports.init = function (startupTime, config, events) {
  var bosun = new BosunBackend(startupTime, config, events);

  return bosun.configCheck();
}