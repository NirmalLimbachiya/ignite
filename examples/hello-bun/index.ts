interface Event {
  name?: string;
  count?: number;
}

interface Response {
  statusCode: number;
  body: {
    message: string;
    runtime: string;
    bunVersion: string;
    input: Event;
  };
}

const input: Event = process.env.IGNITE_INPUT 
  ? JSON.parse(process.env.IGNITE_INPUT) 
  : {};

async function handler(event: Event): Promise<Response> {
  const name = event.name ?? 'World';
  const count = event.count ?? 1;

  const messages: string[] = [];
  for (let i = 0; i < count; i++) {
    messages.push(`Hello, ${name}!`);
  }

  console.log(messages.join('\n'));

  return {
    statusCode: 200,
    body: {
      message: messages.join(' '),
      runtime: 'bun',
      bunVersion: Bun.version,
      input: event,
    },
  };
}

handler(input)
  .then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
