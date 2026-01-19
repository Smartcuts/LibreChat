const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const { logger } = require('@librechat/data-schemas');
const { logAxiosError, isEnabled, readFileAsString } = require('@librechat/api');

/**
 * Converts HTML to plain text for multipart/alternative emails.
 * @param {string} html - The HTML content to convert.
 * @returns {string} - Plain text version.
 */
function htmlToPlainText(html) {
  return html
    // Remove style/script blocks
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove HTML comments (including conditional comments)
    .replace(/<!--[\s\S]*?-->/g, '')
    // Convert links to text with URL
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    // Convert block elements to newlines
    .replace(/<(br|hr|p|div|tr|li|h[1-6])[^>]*>/gi, '\n')
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&copy;/g, '(c)')
    // Normalize whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

/**
 * Sends an email using Mailgun API.
 *
 * @async
 * @function sendEmailViaMailgun
 * @param {Object} params - The parameters for sending the email.
 * @param {string} params.to - The recipient's email address.
 * @param {string} params.from - The sender's email address.
 * @param {string} params.subject - The subject of the email.
 * @param {string} params.html - The HTML content of the email.
 * @param {string} params.text - The plain text content of the email.
 * @returns {Promise<Object>} - A promise that resolves to the response from Mailgun API.
 */
const sendEmailViaMailgun = async ({ to, from, subject, html, text }) => {
  const mailgunApiKey = process.env.MAILGUN_API_KEY;
  const mailgunDomain = process.env.MAILGUN_DOMAIN;
  const mailgunHost = process.env.MAILGUN_HOST || 'https://api.mailgun.net';

  if (!mailgunApiKey || !mailgunDomain) {
    throw new Error('Mailgun API key and domain are required');
  }

  const formData = new FormData();
  formData.append('from', from);
  formData.append('to', to);
  formData.append('subject', subject);
  formData.append('text', text);
  formData.append('html', html);
  formData.append('o:tracking-clicks', 'no');
  formData.append('o:tracking-opens', 'no');
  formData.append('o:require-tls', 'true');

  try {
    const response = await axios.post(`${mailgunHost}/v3/${mailgunDomain}/messages`, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Basic ${Buffer.from(`api:${mailgunApiKey}`).toString('base64')}`,
      },
    });

    return response.data;
  } catch (error) {
    throw new Error(logAxiosError({ error, message: 'Failed to send email via Mailgun' }));
  }
};

/**
 * Sends an email using SMTP via Nodemailer.
 *
 * @async
 * @function sendEmailViaSMTP
 * @param {Object} params - The parameters for sending the email.
 * @param {Object} params.transporterOptions - The transporter configuration options.
 * @param {Object} params.mailOptions - The email options.
 * @returns {Promise<Object>} - A promise that resolves to the info object of the sent email.
 */
const sendEmailViaSMTP = async ({ transporterOptions, mailOptions }) => {
  const transporter = nodemailer.createTransport(transporterOptions);
  return await transporter.sendMail(mailOptions);
};

/**
 * Sends an email using the specified template, subject, and payload.
 *
 * @async
 * @function sendEmail
 * @param {Object} params - The parameters for sending the email.
 * @param {string} params.email - The recipient's email address.
 * @param {string} params.subject - The subject of the email.
 * @param {Record<string, string>} params.payload - The data to be used in the email template.
 * @param {string} params.template - The filename of the email template.
 * @param {boolean} [throwError=true] - Whether to throw an error if the email sending process fails.
 * @returns {Promise<Object>} - A promise that resolves to the info object of the sent email or the error if sending the email fails.
 *
 * @example
 * const emailData = {
 *   email: 'recipient@example.com',
 *   subject: 'Welcome!',
 *   payload: { name: 'Recipient' },
 *   template: 'welcome.html'
 * };
 *
 * sendEmail(emailData)
 *   .then(info => console.log('Email sent:', info))
 *   .catch(error => console.error('Error sending email:', error));
 *
 * @throws Will throw an error if the email sending process fails and throwError is `true`.
 */
const sendEmail = async ({ email, subject, payload, template, throwError = true }) => {
  try {
    const { content: source } = await readFileAsString(path.join(__dirname, 'emails', template));
    const compiledTemplate = handlebars.compile(source);
    const html = compiledTemplate(payload);
    const text = htmlToPlainText(html);

    // Prepare common email data
    const fromName = process.env.EMAIL_FROM_NAME || process.env.APP_TITLE;
    const fromEmail = process.env.EMAIL_FROM;
    const fromAddress = `"${fromName}" <${fromEmail}>`;
    const toAddress = payload.name ? `"${payload.name}" <${email}>` : email;

    // Check if Mailgun is configured
    if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
      logger.debug('[sendEmail] Using Mailgun provider');
      return await sendEmailViaMailgun({
        from: fromAddress,
        to: toAddress,
        subject: subject,
        html: html,
        text: text,
      });
    }

    // Default to SMTP
    logger.debug('[sendEmail] Using SMTP provider');
    const transporterOptions = {
      // Use STARTTLS by default instead of obligatory TLS
      secure: process.env.EMAIL_ENCRYPTION === 'tls',
      // If explicit STARTTLS is set, require it when connecting
      requireTls: process.env.EMAIL_ENCRYPTION === 'starttls',
      tls: {
        // Whether to accept unsigned certificates
        rejectUnauthorized: !isEnabled(process.env.EMAIL_ALLOW_SELFSIGNED),
      },
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    };

    if (process.env.EMAIL_ENCRYPTION_HOSTNAME) {
      // Check the certificate against this name explicitly
      transporterOptions.tls.servername = process.env.EMAIL_ENCRYPTION_HOSTNAME;
    }

    // Mailer service definition has precedence
    if (process.env.EMAIL_SERVICE) {
      transporterOptions.service = process.env.EMAIL_SERVICE;
    } else {
      transporterOptions.host = process.env.EMAIL_HOST;
      transporterOptions.port = process.env.EMAIL_PORT ?? 25;
    }

    const mailOptions = {
      // Header address should contain name-addr
      from: fromAddress,
      to: toAddress,
      envelope: {
        // Envelope from should contain addr-spec
        // Mistake in the Nodemailer documentation?
        from: fromEmail,
        to: email,
      },
      subject: subject,
      text: text,
      html: html,
    };

    return await sendEmailViaSMTP({ transporterOptions, mailOptions });
  } catch (error) {
    if (throwError) {
      throw error;
    }
    logger.error('[sendEmail]', error);
    return error;
  }
};

module.exports = sendEmail;
