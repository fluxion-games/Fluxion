from flask import Flask, request, Response, render_template_string, redirect, url_for
import requests
import base64
from bs4 import BeautifulSoup
import urllib.parse
import mimetypes
import re

app = Flask(__name__)

def decode_url(encoded_url):
    try:
        return base64.b64decode(encoded_url).decode()
    except:
        return None

def encode_url(url):
    return base64.b64encode(url.encode()).decode()

def is_binary_content(content_type):
    return any(t in content_type.lower() for t in ['image', 'audio', 'video', 'application', 'font', 'octet-stream'])

def rewrite_url(url, base_url):
    if url.startswith('//'):
        url = 'https:' + url
    if url.startswith(('http://', 'https://')):
        # Encode the URL in base64 format
        encoded_url = encode_url(url)
        final_url = f'https://4a6f34c3-38a0-4055-bd43-ffddf7a236de-00-1ndzuewxr73an.kirk.replit.dev/other/fluxify/go/{encoded_url}'
    else:
        full_url = urllib.parse.urljoin(base_url, url)
        encoded_url = encode_url(full_url)
        final_url = f'https://4a6f34c3-38a0-4055-bd43-ffddf7a236de-00-1ndzuewxr73an.kirk.replit.dev/other/fluxify/go/{encoded_url}'

    print(f"Rewritten URL: {final_url}")  # Debug print to check URL
    return final_url

def rewrite_html(html_content, base_url):
  soup = BeautifulSoup(html_content, 'html.parser')

  # Rewrite various resource tags
  for tag in soup.find_all(['a', 'link', 'script', 'img', 'form', 'iframe', 'source', 'video', 'audio']):
    for attr in ['href', 'src', 'action', 'data-src', 'data-lazy_src']:
      if tag.get(attr):
        tag[attr] = rewrite_url(tag[attr], base_url)

    # Handle srcset separately (because it's a comma-separated list)
    if tag.get('srcset'):
      parts = tag['srcset'].split(',')
      rewritten = []
      for part in parts:
        tokens = part.strip().split(' ')
        url = tokens[0]
        descriptor = ' '.join(tokens[1:]) if len(tokens) > 1 else ''
        rewritten_url = rewrite_url(url, base_url)
        rewritten.append(f'{rewritten_url} {descriptor}'.strip())
      tag['srcset'] = ', '.join(rewritten)

  # Rewrite CSS urls in style tags and attributes
  for style in soup.find_all(['style']):
    if style.string:
      style.string = re.sub(r'url\([\'"]?([^\'")]+)[\'"]?\)', 
                            lambda m: f'url({rewrite_url(m.group(1), base_url)})',
                            style.string)

  for tag in soup.find_all(style=True):
    tag['style'] = re.sub(r'url\([\'"]?([^\'")]+)[\'"]?\)',
                          lambda m: f'url({rewrite_url(m.group(1), base_url)})',
                          tag['style'])

  # Inject our custom scripts
  if soup.body:
    custom_script = soup.new_tag('script')
    custom_script.string = '''
      document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('form').forEach(form => {
          form.addEventListener('submit', function(e) {
            e.preventDefault();
            let action = form.action || window.location.href;
            let encoded = btoa(action);
            form.action = '/other/fluxify/go/' + encoded;
            form.submit();
          });
        });

        document.addEventListener('click', function(e) {
          if (e.target.tagName === 'A') {
            let href = e.target.getAttribute('href');
            if (href && !href.startsWith('/other/fluxify/go/')) {
              e.preventDefault();
              window.location.href = '/other/fluxify/go/' + btoa(href);
            }
          }
        });
      });
    '''
    soup.body.append(custom_script)

  return str(soup)

@app.route('/')
def index():
    return render_template_string('''
        <!DOCTYPE html>
        <html>
            <head>
                <title>Fluxify - Advanced Web Access</title>
                <style>
                    body { 
                        font-family: Arial;
                        background: #1a1a1a;
                        color: #fff;
                        margin: 0;
                        padding: 20px;
                    }
                    .container {
                        max-width: 800px;
                        margin: 50px auto;
                        text-align: center;
                    }
                    .url-input {
                        width: 80%;
                        padding: 15px;
                        margin: 20px 0;
                        border: none;
                        border-radius: 5px;
                        background: #2a2a2a;
                        color: #fff;
                        font-size: 16px;
                    }
                    .go-btn {
                        padding: 15px 30px;
                        background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%);
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 16px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Fluxify</h1>
                    <input type="text" id="url" class="url-input" placeholder="Enter URL">
                    <button onclick="go()" class="go-btn">Access Site</button>
                </div>
                <script>
                    function go() {
                        let url = document.getElementById('url').value;
                        if (!url.startsWith('http')) {
                            url = 'https://' + url;
                        }
                        window.location.href = '/other/fluxify/go/' + btoa(url);
                    }
                    document.getElementById('url').addEventListener('keypress', function(e) {
                        if (e.key === 'Enter') go();
                    });
                </script>
            </body>
        </html>
    ''')

@app.route('/go/<encoded_url>')
def go(encoded_url):
    url = decode_url(encoded_url)
    if not url:
        return "Invalid URL", 400

    try:
        headers = {
            'User-Agent': request.headers.get('User-Agent', 'Mozilla/5.0'),
            'Accept': request.headers.get('Accept', '*/*'),
            'Accept-Language': request.headers.get('Accept-Language', 'en-US,en;q=0.5'),
            'Accept-Encoding': request.headers.get('Accept-Encoding', 'gzip, deflate'),
        }

        resp = requests.get(url, headers=headers, stream=True, allow_redirects=True)
        content_type = resp.headers.get('content-type', 'text/html')

        # Handle binary content (images, videos, etc.)
        if is_binary_content(content_type):
            return Response(resp.content, resp.status_code, 
                          {'Content-Type': content_type})

        # Handle HTML content
        if 'text/html' in content_type:
            content = rewrite_html(resp.text, url)
            return Response(content, resp.status_code, 
                          {'Content-Type': 'text/html'})

        # Handle other text content (CSS, JS, etc.)
        return Response(resp.text, resp.status_code, 
                      {'Content-Type': content_type})

    except Exception as e:
        return f"Error accessing URL: {str(e)}", 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
