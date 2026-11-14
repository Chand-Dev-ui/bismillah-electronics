// Supabase-backed storefront. Cart and wishlist remain local to this browser.
const $ = id => document.getElementById(id);
const money = n => "Rs. " + Number(n).toLocaleString("en-PK");
const cfg = window.SUPABASE_CONFIG || {};
const configured = cfg.url && cfg.anonKey && !cfg.url.includes("PASTE_") && !cfg.anonKey.includes("PASTE_");
const sb = configured ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;
let products = [], cart = JSON.parse(localStorage.getItem("be-cart") || "[]");
let wishlist = JSON.parse(localStorage.getItem("be-wishlist") || "[]"), activeSearch = "", deliveryCharges = [];
function saveState(){localStorage.setItem("be-cart",JSON.stringify(cart));localStorage.setItem("be-wishlist",JSON.stringify(wishlist));}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function render(){
 const category=$("categoryFilter").value,brand=$("brandFilter").value,ram=$("ramFilter").value,storage=$("storageFilter").value,network=$("networkFilter").value,max=+$("priceFilter").value;
 let list=products.filter(p=>(!category||p.category===category)&&(!brand||p.brand===brand)&&(!ram||p.ram===ram)&&(!storage||p.storage===storage)&&(!network||p.network===network)&&Number(p.price)<=max&&(`${p.brand} ${p.name}`).toLowerCase().includes(activeSearch));
 if($("sortFilter").value==="low")list.sort((a,b)=>a.price-b.price); if($("sortFilter").value==="high")list.sort((a,b)=>b.price-a.price);
 $("resultCount").textContent=list.length+" products";
 $("productGrid").innerHTML=list.map(p=>`<article class="product-card"><div class="product-art">${p.image_urls?.[0]?`<img class="product-photo" src="${escapeHtml(p.image_urls[0])}" alt="${escapeHtml(p.name)}">`:'<div class="mini-phone"></div>'}<button class="wish-btn ${wishlist.includes(p.id)?"active":""}" onclick="toggleWish('${p.id}')">${wishlist.includes(p.id)?"♥":"♡"}</button></div><div class="product-info"><div class="product-brand">${escapeHtml((p.brand||"").toUpperCase())}</div><h3>${escapeHtml(p.name)}</h3><div class="price-line"><span class="price">${money(p.price)}</span>${p.original_price>p.price?`<span class="old-price">${money(p.original_price)}</span><span class="discount">${Math.round((1-p.price/p.original_price)*100)}% OFF</span>`:""}</div><div class="specs">${escapeHtml(p.ram||"")} RAM · ${escapeHtml(p.storage||"")} · ${escapeHtml(p.network||"")}</div><div class="card-actions"><button class="add-btn" onclick="addCart('${p.id}')">Add to cart</button><button class="quick-btn" onclick="quickView('${p.id}')">Quick view</button></div></div></article>`).join("");
 $("emptyState").hidden=list.length>0; $("wishCount").textContent=wishlist.length; $("cartCount").textContent=cart.reduce((s,x)=>s+x.qty,0); $("priceLabel").textContent=money(max); renderCart();
}
async function loadProducts(){
 if(!sb){$("emptyState").hidden=false;$("emptyState").textContent="Store setup is not complete yet. Add your Supabase URL and Publishable Key in config.js.";return;}
 const {data,error}=await sb.from("products").select("*").eq("is_active",true).order("created_at",{ascending:false});
 if(error){$("emptyState").hidden=false;$("emptyState").textContent="Could not load products. Check Supabase setup and database policies.";console.error(error);return;}
 products=data||[];await loadAccountWishlist();const selectedCategory=$("categoryFilter").value;const categories=[...new Set(products.map(p=>p.category||"Smartphones"))].sort();$("categoryFilter").innerHTML='<option value="">All categories</option>'+categories.map(c=>`<option>${escapeHtml(c)}</option>`).join("");$("categoryFilter").value=categories.includes(selectedCategory)?selectedCategory:"";const sel=$("brandFilter").value,brands=[...new Set(products.map(p=>p.brand).filter(Boolean))].sort();
 $("brandFilter").innerHTML='<option value="">All brands</option>'+brands.map(b=>`<option>${escapeHtml(b)}</option>`).join("");$("brandFilter").value=brands.includes(sel)?sel:"";render();
}
async function loadAccountWishlist(){if(!sb)return;const {data:{user}}=await sb.auth.getUser();if(!user)return;const {data,error}=await sb.from('wishlist_items').select('product_id');if(!error){wishlist=[...new Set([...(wishlist||[]),...(data||[]).map(x=>x.product_id)])];saveState();}}
async function loadDeliveryCharges(){if(!sb)return;const {data,error}=await sb.from('city_delivery_charges').select('city,fee,estimated_days');if(!error)deliveryCharges=data||[];}
function updateDeliveryPreview(){const city=$('orderCity').value.trim().toLowerCase();const found=deliveryCharges.find(x=>x.city.toLowerCase()===city);const fee=Number(found?.fee||0);$('deliveryPreview').textContent=found?`Delivery: ${money(fee)} · Estimated ${found.estimated_days} day(s). Total: ${money(cart.reduce((s,x)=>{const p=products.find(p=>p.id===x.id);return s+(p?p.price*x.qty:0)},0)+fee)}.`:'No delivery fee set for this city yet. Please confirm with the store before placing your order.';}
function addCart(id){let item=cart.find(x=>x.id===id);if(item)item.qty++;else cart.push({id,qty:1});saveState();render();toast("Added to cart");}
async function toggleWish(id){const removing=wishlist.includes(id);wishlist=removing?wishlist.filter(x=>x!==id):[...wishlist,id];saveState();render();renderWishlist();if(sb){const {data:{user}}=await sb.auth.getUser();if(user){if(removing)await sb.from('wishlist_items').delete().eq('customer_id',user.id).eq('product_id',id);else await sb.from('wishlist_items').upsert({customer_id:user.id,product_id:id});}}}
function renderWishlist(){
 const items=wishlist.map(id=>products.find(p=>p.id===id)).filter(Boolean);
 $("wishlistItems").innerHTML=items.map(p=>`<div class="wishlist-item">${p.image_urls?.[0]?`<img src="${escapeHtml(p.image_urls[0])}" alt="${escapeHtml(p.name)}">`:'<div class="wishlist-placeholder">BE</div>'}<div class="wishlist-meta"><b>${escapeHtml(p.name)}</b><span>${money(p.price)}</span><div><button onclick="addCart('${p.id}')">Add to cart</button><button class="remove-wish" onclick="toggleWish('${p.id}')">Remove</button></div></div></div>`).join("")||'<p class="wishlist-empty">Your wishlist is empty. Tap the heart on any product to save it here.</p>';
}
function renderCart(){let total=0;$("cartItems").innerHTML=cart.map(x=>{let p=products.find(p=>p.id===x.id);if(!p)return "";total+=p.price*x.qty;return `<div class="cart-item"><div><b>${escapeHtml(p.name)}</b><p>${x.qty} × ${money(p.price)}</p></div><button onclick="removeCart('${p.id}')">Remove</button></div>`}).join("")||'<p class="filter-note">Your cart is empty.</p>';$("cartSubtotal").textContent=money(total);}
function removeCart(id){cart=cart.filter(x=>x.id!==id);saveState();render();}
function quickView(id){let p=products.find(x=>x.id===id);if(!p)return;$("quickContent").innerHTML=`<div class="quick-detail">${p.image_urls?.[0]?`<img class="quick-photo" src="${escapeHtml(p.image_urls[0])}" alt="${escapeHtml(p.name)}">`:""}<span class="eyebrow">${escapeHtml((p.brand||"").toUpperCase())}</span><h2>${escapeHtml(p.name)}</h2><h3>${money(p.price)}</h3><p>${escapeHtml(p.description||"")}</p><p><b>Specifications:</b> ${escapeHtml(p.ram||"")} RAM · ${escapeHtml(p.storage||"")} storage · ${escapeHtml(p.network||"")}</p><button class="primary-btn" onclick="addCart('${p.id}');closeModal()">Add to cart</button></div>`;$("quickModal").classList.add("show");}
function closeModal(){$("quickModal").classList.remove("show");}
function openWishlist(){renderWishlist();$("wishlistModal").classList.add("show");}
function closeWishlist(){$("wishlistModal").classList.remove("show");}
function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),1800);}
function openCart(){$("cartDrawer").classList.add("open");$("overlay").classList.add("show");}
function closeCart(){$("cartDrawer").classList.remove("open");$("overlay").classList.remove("show");}
async function checkout(){
 if(!cart.length){toast("Your cart is empty");return;}
 if(!sb){toast("Store setup is incomplete");return;}
 const {data:{session},error}=await sb.auth.getSession();
 if(error||!session){toast("Please sign in before checkout");location.href="customer.html";return;}
 $("checkoutMessage").textContent="";
 await loadDeliveryCharges();$("checkoutModal").classList.add("show");updateDeliveryPreview();
}
$("checkoutForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const btn=$("placeOrderBtn"),msg=$("checkoutMessage");
 if(!sb){msg.textContent="Store setup is incomplete.";return;}
 const {data:{session},error:sessionError}=await sb.auth.getSession();
 if(sessionError||!session){msg.textContent="Please sign in again.";return;}
 const items=cart.map(x=>({product_id:x.id,quantity:x.qty})).filter(x=>products.some(p=>p.id===x.product_id));
 if(!items.length){msg.textContent="Your cart has no available products.";return;}
 btn.disabled=true;btn.textContent="Placing order...";msg.textContent="Please wait while we save your order.";
 try{
   const {data,error}=await sb.functions.invoke("create-order",{body:{customer_name:$("orderName").value.trim(),phone:$("orderPhone").value.trim(),email:$("orderEmail").value.trim()||null,address:$("orderAddress").value.trim(),city:$("orderCity").value.trim(),payment_method:$("orderPayment").value,items}});
   if(error) throw error;
   if(!data?.success||!data?.order?.order_id) throw new Error(data?.error||"Order response was incomplete.");
   const order=data.order;
   cart=[];saveState();render();$("checkoutModal").classList.remove("show");closeCart();
   toast("Order saved successfully: "+order.order_id);
   alert("Your order has been saved. Order ID: "+order.order_id+"\nTotal: "+money(order.total)+"\nDelivery fee: "+money(order.delivery_fee)+"\nOur team will contact you to confirm manual payment details.");
 }catch(err){
   console.error("Checkout error:",err);
   msg.textContent=err?.message||"Order failed. Please try again.";
 }finally{btn.disabled=false;btn.textContent="Place order";}
});
function closeCheckout(){$("checkoutModal").classList.remove("show");}
$("checkoutClose").onclick=closeCheckout;
$("orderCity").addEventListener('input',updateDeliveryPreview);
$("contactForm").addEventListener('submit',async e=>{e.preventDefault();const status=$('contactStatus');if(!sb){status.textContent='Store setup is incomplete.';return}const row={name:$('contactName').value.trim(),email:$('contactEmail').value.trim()||null,phone:$('contactPhone').value.trim()||null,message:$('contactMessage').value.trim()};const {error}=await sb.from('contact_messages').insert(row);status.textContent=error?'Message could not be sent: '+error.message:'Thank you. Your message has been sent.';if(!error)$('contactForm').reset();});

$("year").textContent=new Date().getFullYear();
["categoryFilter","brandFilter","ramFilter","storageFilter","networkFilter","priceFilter","sortFilter"].forEach(id=>$(id).addEventListener("input",render));
$("searchForm").addEventListener("submit",e=>{e.preventDefault();activeSearch=$("searchInput").value.trim().toLowerCase();render();$("catalog").scrollIntoView({behavior:"smooth"});});
$("searchInput").addEventListener("input",e=>{activeSearch=e.target.value.trim().toLowerCase();render();});
$("clearFilters").onclick=()=>{["categoryFilter","brandFilter","ramFilter","storageFilter","networkFilter"].forEach(id=>$(id).value="");$("priceFilter").value=300000;$("searchInput").value="";activeSearch="";$("sortFilter").value="featured";render();};
$("cartOpen").onclick=openCart;$("cartClose").onclick=closeCart;$("overlay").onclick=closeCart;$("checkoutBtn").onclick=checkout;$("modalClose").onclick=closeModal;$("wishlistTop").onclick=openWishlist;$("wishlistClose").onclick=closeWishlist;
loadDeliveryCharges();loadProducts();
