import { type PropsWithChildren, useEffect, useState } from 'react';
import { buildInfo } from '../../app/buildInfo';
import type { DatabaseLifecycleStatus } from '../../data/database';
import { kairosRepositories } from '../../data/repositories';
import {
  ActivationCoordinator,
  ActivationReceiptRepository,
  EcdsaActivationReceiptVerifier,
  RemoteActivationAdapter,
  parseActivationDeploymentConfig,
} from '../../services/activation';
import { ActivationGate } from './ActivationGate';

export interface ActivationBootstrapProps extends PropsWithChildren {
  readonly databaseStartup: Promise<DatabaseLifecycleStatus>;
}

type RuntimeState =
  | { readonly state: 'preparing' }
  | { readonly state: 'ready'; readonly controller: ActivationCoordinator }
  | { readonly state: 'unavailable'; readonly message: string };

function readRuntimeConfig() {
  return parseActivationDeploymentConfig({
    endpoint: import.meta.env.VITE_KAIROS_ACTIVATION_ENDPOINT,
    publicKeySpkiBase64: import.meta.env.VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI,
  });
}

function buildController(config: { readonly endpoint: string; readonly publicKeySpkiBase64: string }): ActivationCoordinator {
  return new ActivationCoordinator({
    adapter: new RemoteActivationAdapter({ endpoint: config.endpoint }),
    repository: new ActivationReceiptRepository(kairosRepositories.metadata),
    verifier: new EcdsaActivationReceiptVerifier({
      publicKeySpkiBase64: config.publicKeySpkiBase64,
    }),
  });
}

export function ActivationBootstrap({ databaseStartup, children }: ActivationBootstrapProps) {
  const [runtime, setRuntime] = useState<RuntimeState>({ state: 'preparing' });

  useEffect(() => {
    let active = true;
    void databaseStartup.then((databaseStatus) => {
      if (!active) return;
      if (databaseStatus.state !== 'ready') {
        setRuntime({
          state: 'unavailable',
          message: 'Kairos could not open secure device storage. Your journal has not been opened.',
        });
        return;
      }

      const configResult = readRuntimeConfig();
      if (!configResult.ok) {
        setRuntime({
          state: 'unavailable',
          message: 'Activation is not configured for this build yet.',
        });
        return;
      }

      try {
        setRuntime({ state: 'ready', controller: buildController(configResult.config) });
      } catch {
        setRuntime({
          state: 'unavailable',
          message: 'Activation configuration could not be loaded.',
        });
      }
    }).catch(() => {
      if (active) {
        setRuntime({
          state: 'unavailable',
          message: 'Kairos could not prepare device storage. Your journal has not been opened.',
        });
      }
    });

    return () => {
      active = false;
    };
  }, [databaseStartup]);

  if (runtime.state === 'preparing') {
    return (
      <main className="kairos-activation">
        <section className="kairos-activation__card">
          <p className="kairos-activation__status" role="status" aria-live="polite">
            Preparing Kairos…
          </p>
        </section>
      </main>
    );
  }

  if (runtime.state === 'unavailable') {
    return (
      <main className="kairos-activation">
        <section className="kairos-activation__card" aria-labelledby="kairos-activation-unavailable-title">
          <p className="kairos-activation__eyebrow">Kairos Trading Journal</p>
          <h1 id="kairos-activation-unavailable-title">Kairos can’t open yet</h1>
          <p className="kairos-activation__feedback" role="alert">{runtime.message}</p>
        </section>
      </main>
    );
  }

  return (
    <ActivationGate
      controller={runtime.controller}
      appVersion={buildInfo.appVersion}
      buildId={buildInfo.buildId}
    >
      {children}
    </ActivationGate>
  );
}
