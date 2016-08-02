# StatsD Bosun publisher backend

## Overview
This is a pluggable backend for [StatsD](https://github.com/etsy/statsd), which publishes stats to [Bosun](http://bosun.org/). It is based off [statsd-influxdb-backend](https://github.com/bernd/statsd-influxdb-backend) and [statsd-opentsdb-backend](https://github.com/danslimmon/statsd-opentsdb-backend).

## Installation

Copy lib/bosun.js to your statsd backends directory

## Configuration
The backend will read the configuration options from the following 'bosun' hash defined in the main statsd config file:
```
bosun: {
  host: '127.0.0.1',   // Bosun host. (default 127.0.0.1)
  port: 8087,          // Bosun port. (default 8087)
  ssl: false,          // Bosun is hosted over SSL. (default false)
  tagPrefix: '_t_'     // Tag prefix for metrics that include tags
}
```

## Tag support
This backend allows you to attach tags to your metrics. To add a counter
called `users` and tag the data `foo=bar`, you'd write the following to statsd:

    users._t_foo.bar:261|c

## Notes
- Bosun metadata is not yet supported
- This backend can also be used to send metrics directly to an OpenTSDB server over HTTP/S

## Dependencies
- none

## Issues
- [Issues](https://github.com/TrentScholl/statsd-bosun-backend/issues)