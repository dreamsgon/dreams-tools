"use client";

import AgentAccess from "./agent-access";
import DiscordConnections from "./discord-connections";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Modal } from "./dialogs";

export function ConnectionsDialog({

  campaignId,

  campaignName,

  close,

  onUpdated,

}: {

  close: () => void;

  campaignId: string | null;

  campaignName: string | null;

  onUpdated: (s: { s3Configured: boolean; discordConfigured: boolean }) => void;

}) {

  const [status, setStatus] = useState<{ s3Configured: boolean; s3ObjectPrefix?: string; discordConfigured: boolean } | null>(null);

  const url = "/api/settings"+(campaignId?`?campaignId=${encodeURIComponent(campaignId)}`:"");

  useEffect(() => {

    let active = true;

    api<{ s3Configured: boolean; s3ObjectPrefix?: string; discordConfigured: boolean }>(url).then(value => { if (active) setStatus(value); }).catch(() => {});

    return () => { active = false; };

  }, [url]);

  // After a Discord change, Maptable learns whether this campaign can post now.
  const changed = () => void api<{ s3Configured: boolean; s3ObjectPrefix?: string; discordConfigured: boolean }>(url).then(value => { setStatus(value); onUpdated(value); }).catch(() => {});

  return (

    <Modal title="Connections" close={close}>

      <DiscordConnections key={campaignId ?? ""} campaignId={campaignId} campaignName={campaignName} onChanged={changed} />

      <hr />

      <AgentAccess campaignId={campaignId} campaignName={campaignName}/>

      <hr />

      <h3>

        Amazon S3{" "}

        <span className="status-label">

          {status?.s3Configured ? "Configured" : "Optional"}

        </span>

      </h3>

      <p className="muted">

        Map images already use the app’s private storage bucket. To connect an additional image bucket, add

        these server environment variables in Vercel:

      </p>

      <p><a href="https://s3.console.aws.amazon.com/s3/buckets" target="_blank" rel="noreferrer">Open Amazon S3 console</a></p>

      {status?.s3ObjectPrefix && <p className="muted">Your image folder in the optional bucket: <code>{status.s3ObjectPrefix}</code>. Enter object keys relative to this folder.</p>}

      <div className="code-list">

        S3_BUCKET

        <br />

        MAPTABLE_AWS_REGION

        <br />

        MAPTABLE_AWS_ACCESS_KEY_ID

        <br />

        MAPTABLE_AWS_SECRET_ACCESS_KEY

        <br />

        S3_PREFIX <span>(default: maptable/)</span>

        <br />

        MAPTABLE_AWS_SESSION_TOKEN <span>(only for temporary credentials)</span>

      </div>

      <p className="muted">

        Use a dedicated IAM identity with GetObject and PutObject permissions

        for that prefix. The bucket can remain private. Import an existing image

        using its object key, or choose S3 when uploading.

      </p>

      <p className="muted">

        Public S3 or CloudFront URLs also work through Image URL if the host

        allows CORS. Credentials are never entered into this browser form.

      </p>

    </Modal>

  );

}

