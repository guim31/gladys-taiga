// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Taiga on a fake
// network, a temporary /data, a manual clock and the Paris time zone, with
// the integration wired on top through registerHandlers. No timer runs unless
// `timers: true` (with node:test mock timers): the tests read Taiga with
// `world.hub.poll()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { EMAIL, FakeTaiga, MAISON, PASSWORD, SITE, USERNAME, createNetwork } from './fakeTaiga.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const URL_1 = 'http://192.0.2.20:9000';
export const TIME_ZONE = 'Europe/Paris';
// The fixtures were captured on 22/11/2026 at 11:50 UTC; the tests start at
// 10:00 UTC (11:00 in Paris). Overdue then: "Repeindre la cuisine",
// "Acheter la peinture", "Fuite sous l'évier" (Maison), "Lien cassé sur
// l'accueil" (Site web); due today: "Appeler le plombier".
export const START = Date.UTC(2026, 10, 22, 10, 0, 0);

export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const BASE_CONFIG = {
  url: URL_1,
  username: USERNAME,
  password: PASSWORD,
  language: 'en',
};

/**
 * @param {object} [options]
 * @param {FakeTaiga} [options.server]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 */
export async function createWorld({
  clock = createClock(),
  server,
  config = BASE_CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-taiga-')),
  timings = {},
  timers = false,
} = {}) {
  const taiga = server ?? new FakeTaiga();
  const network = createNetwork({ [URL_1]: taiga });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
    timeZone: TIME_ZONE,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, server: taiga, app, hub: app.hub, clock, dataDir };
}

export const projectId = (gladys, id = MAISON) => gladys.externalIds('project', `project-${id}`);
export const instanceId = (gladys) => gladys.externalIds('instance', 'instance-main');

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { EMAIL, FakeTaiga, MAISON, PASSWORD, SITE, USERNAME };
